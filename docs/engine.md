# The prediction engine

Everything here is pure: no database, no clock, no unseeded randomness. The
same inputs always produce the same `leaveBy`, which is both a correctness
requirement and what makes the engine testable in nine seconds.

**No LLM is involved at any point.** The output is arithmetic.

---

## Pipeline

```
TemplateGraph + history + conditions + target
        │
        ├─ 1. enumerateRoutes          graph.ts
        │     every simple path origin → destination
        │
        ├─ 2. buildDurationSample      statistics.ts
        │     real history, shrunk toward the expected duration
        │
        ├─ 3. weatherPenalty           weatherPenalty.ts
        │     shifts the mean
        │
        ├─ 4. trafficPenalty           trafficPenalty.ts
        │     shifts the mean AND widens the spread
        │
        ├─ 5. crowdPenalty             crowdPenalty.ts
        │     fixed boarding delay, wider spread
        │
        ├─ 6. transferRisk             transferRisk.ts
        │     expected loss from a missed connection
        │
        ├─ 7. simulate                 prediction.ts
        │     Monte Carlo over the joint distribution
        │
        ├─ 8. computeReliability       reliability.ts
        │     weighted composite, blended toward neutral
        │
        └─ 9. select                   highest reliability, ties on P90
```

---

## 1. Route enumeration

A template is a directed graph; a branch is two or more outgoing edges from
one stop. `enumerateRoutes` walks the graph and returns every **simple path**
(no repeated stop), ordered by expected duration and capped at 24.

Simple paths, not all paths, because a human never loops back to a stop they
already passed — and it keeps enumeration finite on a cyclic graph.

---

## 2. Duration distributions

This is where most of the care goes.

### Shrinkage

Below a threshold the engine does not trust the sample. It blends the observed
mean toward the template's `expectedDurationMin` with pseudo-observation
weighting:

```
blended = (n · observedMean + k · expectedDuration) / (n + k)
```

With `k = 4`, a route with no history sits exactly at its expected duration
and converges on the user's real experience as data accumulates.

### Synthesised spread

With fewer than 5 observations the empirical P90 is just the worst day you
happened to have, which is a terrible basis for planning. Instead the engine
generates a **lognormal** sample around the shrunk mean at an assumed
coefficient of variation:

| observations | assumed CV |
| ------------ | ---------- |
| 0            | 0.30       |
| 2            | 0.25       |
| 5            | 0.20       |
| 10           | 0.16       |
| 20+          | 0.12       |

Lognormal because commute durations are right-skewed — a bad day is much
worse than a good day is better. A symmetric distribution would put as much
probability above the mean as below, which is not how commuting feels.

With 5+ observations the **real** sample is used, rescaled to the new mean and
spread. That preserves the observed *shape* of this user's bad days, which is
the genuinely valuable part of the record.

---

## 3. Weather

Rain hurts commutes in two different ways, and the asymmetry is the point.

| condition | walk | bus | metro | auto | bike |
| --------- | ---- | --- | ----- | ---- | ---- |
| clear      | 0    | 0   | 0     | 0    | 0    |
| cloudy     | 1%   | 1%  | 0     | 1%   | 1%   |
| light_rain | 10%  | 7%  | 0     | 10%  | 18%  |
| rain       | 30%  | 25% | 2%    | 28%  | 45%  |
| heavy_rain | 55%  | 60% | 5%    | 65%  | 90%  |

Walking gets physically slower (wet footpaths, puddles). Road transport gets
slower *and* less predictable. Metro and train barely move. That is why Reach
recommends rail when it rains, and it is the main reason the app exists.

---

## 4. Traffic

Traffic returns **two** numbers, not one.

- `fraction` — the mean slowdown
- `dispersionMultiplier` — how much the leg's spread should grow

| level     | bus mean | bus spread | metro mean | metro spread |
| --------- | -------- | ---------- | ---------- | ------------ |
| low       | +4%      | ×1.05      | 0%         | ×1.00        |
| medium    | +12%     | ×1.35      | +1%        | ×1.02        |
| high      | +28%     | ×1.90      | +2%        | ×1.05        |
| very_high | +50%     | ×2.60      | +4%        | ×1.10        |

The spread multiplier is the more important of the two. A metro line runs on a
fixed headway, so its P90 is close to its P50. A bus in peak traffic can swing
by twenty minutes. Ranking on P90 rather than P50 is what makes rail win.

---

## 5. Crowd

Crowding costs two separate things, and conflating them is a common modelling
error:

- **Boarding delay** — 0 to 3.4 minutes, scaled by mode (a bus is harder to
  board than a metro train)
- **Transfer uncertainty** — walking a crowded interchange is slow, so the leg
  after a transfer gets a wider spread

The very first boarding of a commute is exempt: the walk to the stop already
absorbed the time.

---

## 6. Transfer risk

A missed connection is the most expensive failure mode in a multi-modal
commute — 12 to 30 minutes, an order of magnitude worse than being slightly
late on one bus. It is modelled explicitly rather than averaged into a
duration.

For a connection with headway `h` and effective window `w`:

```
P(catch) = 1        if w ≥ h
         = w / h    otherwise
```

The effective window is the declared `transferWindowMin` plus the leg's
buffer, minus the walk through a crowded interchange, minus traffic on the
platform walk.

A connection is flagged **tight** when the catch probability is below 80% *or*
the window leaves under 4 minutes on the clock. Both are worth warning about:
one is unlikely, the other survives a probability model but not one delay.

---

## 7. Monte Carlo

Total duration is a sum of dependent legs, and the dependencies matter. If
rain slows traffic it slows *every* road leg in the trip, so summing per-leg
P90s badly overstates the total.

The engine instead simulates the joint distribution — 2,000 iterations,
seeded from the route signature — and reads percentiles off the **totals**.
The reported P90 is an actual simulated arrival time, not a worst-case sum.

The random source is `mulberry32` seeded from
`<templateId>:<routeSignature>:<algorithmVersion>`, so the answer is stable
across renders and the algorithm version is baked into the seed — bumping the
version invalidates every cached score automatically.

---

## 8. Reliability score

The 0..100 headline, a weighted blend of five normalised components:

| Component   | Weight | Source |
| ----------- | -----: | ------ |
| Punctuality |   0.30 | historical on-time rate for this route, or the modelled probability |
| Variance    |   0.25 | `1 − CV/0.5` — penalises spread, not slowness |
| Transfer    |   0.20 | mean probability of catching each connection |
| Crowd       |   0.15 | inverse boarding difficulty |
| Traffic     |   0.10 | inverse congestion penalty |

**Why these weights.** Punctuality and variance lead because they come from the
user's own data and directly answer "will this get me there on time". Transfer
sits above the condition proxies because a missed connection is a step change
in lateness, whereas traffic and crowd are already partly baked into the
observed durations — counting them fully would double-count.

### Confidence

Sparse history must not read as certainty. `confidence` scales how far a score
can sit from neutral:

```
confidence = ln(1 + n) / ln(1 + 12)     0 at n=0, 1 at n≥12
score      = confidence · observed + (1 − confidence) · 50
```

A fresh install therefore surfaces every route near 50 and lets real data
differentiate them. Confidence is computed from **real** observation count
only — a simulation must not manufacture confidence in the model.

### Buffer

```
buffer = clamp(0.5·σ + 2·transfers + 3·tightTransfers + 0.04·P90, 2, 20)
```

Shrinks when the distribution is tight, grows with transfers and with trip
length.

---

## 9. Selection

Highest reliability wins. Ties within half a point break on lower P90 — an
equally reliable faster route is strictly better, so the tiebreak has no
trade-off.

The recommendation is:

```
leaveBy = targetArrival − P90
eta     = now + P50
```

Both derived from the **rounded** durations that are displayed, so
"leave by 8:12" always equals "your 9:05 deadline minus the P90 you can see".

---

## Conditions and history together

Route-level history is the most direct evidence available and captures
second-order effects the per-leg model cannot. But it is a record of how the
route behaved on *previous* days, so it has to be rescaled for today:

```
shift    = adjustedExpectedTotal / templateExpectedTotal
adjusted = history.map(duration => duration × shift)
```

The shift is a single scalar rather than a per-leg transform because history
stores one total per trip. Scaling the total preserves the observed shape of
this user's bad days — the valuable part — while moving the mean and the P90
together. Bounded to 0.4×–4× so a pathological template cannot produce an
absurd duration.

Without this step, a route with fifty logged trips reports identical numbers in
clear weather and a downpour. That bug existed during the build and is now
locked down by a regression test.

---

## Output

```jsonc
{
  "templateId": "…",
  "generatedAt": 1705288200000,
  "targetArrivalAt": 1705291500000,
  "leaveBy": 1705288380000,
  "eta": 1705291080000,
  "fastestDurationMin": 39.0,
  "travelTimeP50Min": 48.0,
  "travelTimeP75Min": 50.0,
  "travelTimeP90Min": 52.0,
  "travelTimeP95Min": 56.0,
  "meanDurationMin": 49.2,
  "stddevMinutes": 5.1,
  "onTimeProbability": 0.92,
  "reliabilityScore": 87,
  "confidence": 1,
  "suggestedBufferMin": 6,
  "recommendedSignature": "seg_a|seg_b|seg_c",
  "recommendedStopIds": ["…"],
  "algorithmVersion": "1.0.0"
}
```

Plus every alternative with its own P50, P90, on-time probability and score,
and a ranked list of `ReliabilityFactor`s naming the signed contribution of
each component — which is what the "Why this route" sheet renders.

---

## Gemini's role

None, in the maths. `src/services/ai` exposes one interface,
`ExplanationAdapter`, whose only method takes an already-computed
recommendation and returns one sentence under 60 words. There is no method
that asks an adapter which route to take, and no adapter is given the user's
history or location.

If the API key is absent, the network fails, or the feature is off,
`explainRecommendation` returns a locally generated explanation. It never
throws.
