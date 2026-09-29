# Reach

**Personal commute reliability predictor — arrive on time, not just quickly.**

Reach learns from your own commute history and recommends the route most
likely to get you to work on time. It runs entirely offline: no account, no
sync, no cloud. All data lives in a local SQLite database.

The premise is simple: **the fastest route is often not the most reliable
one.** A bus that takes 40 minutes on average might take 70 when it rains. A
metro leg takes 11 minutes and takes 12 when it rains. Reach models that
difference explicitly and tells you when to leave.

---

## Status

| Area | State |
| ---- | ----- |
| Prediction engine (graph, P90, reliability, penalties) | Complete, unit tested |
| SQLite schema + migrations | Complete |
| Template builder + route graph editing | Complete |
| One-tap commute logging | Complete |
| History + Insights dashboard | Complete |
| Departure notifications | Complete (needs a dev build) |
| Export / import backup | Complete |
| Optional Gemini explanation | Complete, off by default |
| Unit tests | 294 passing |
| Typecheck / lint / bundle | Clean (Android + iOS) |

```bash
cd mobile
pnpm install
pnpm start        # then press i / a, or scan the QR with Expo Go
```

Verification:

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # jest
npx expo-doctor   # 21 checks
```

---

## Architecture

```
app/                         expo-router routes only, no business logic
  (tabs)/
    (today)/                 hero card, timeline, one-tap logging
    (history)/               list + detail
    (templates)/             list + editor
    (insights)/              statistics dashboard
    (settings)/              preferences, AI, data

src/
  components/
    ui/                      Material 3 primitives
    charts/                  hand-rolled react-native-svg charts
  constants/                 design tokens, settings schema, mode metadata
  db/                        schema, migrations, queries
  engine/                    the prediction engine (pure, no I/O)
  features/                  per-feature state, services and view models
  hooks/                     thin TanStack Query wrappers
  services/                  AI adapter, notifications, backup
  store/                     theme, query client, zustand stores
  types/                     zod schemas + SQLite row codecs
  utils/                     maths and time helpers
```

Three rules hold the codebase together:

1. **No SQL in a screen.** Every query lives in `src/db/queries.ts`.
2. **No business logic in a screen.** The engine, logging state machine and
   statistics all live in `src/engine` and `src/features`.
3. **The engine never calls out.** It takes a graph plus history and returns
   numbers. It is pure, deterministic and fully testable without a database.

See [docs/architecture.md](docs/architecture.md) for the full picture and
[docs/engine.md](docs/engine.md) for how the scoring works.

---

## Data model

A commute template is a **directed graph**: stops are nodes, segments are
directed edges. Adding a second outgoing edge from one stop is what creates an
alternative route — there is no separate "branch" concept.

```
Home ──walk──▶ Bus Stop A ──bus 10H──▶ Ameerpet
                                    │
                                    ├─metro Blue──▶ Moosarambagh ──walk──▶ HITAM
                                    └─walk────────▶ Moosarambagh
```

Both paths out of Ameerpet are alternatives, and the engine scores each one.
See [docs/data_model.md](docs/data_model.md) for every table and column.

---

## The prediction engine

Given a template, a target arrival time, the current conditions and the user's
history, the engine answers:

```jsonc
{
  "leaveBy": 1705286298000,       // target − P90
  "eta": 1705289070000,           // now + P50
  "travelTimeP90Min": 52.0,        // plan against this, not the average
  "onTimeProbability": 0.92,
  "reliabilityScore": 87,         // 0..100 composite
  "recommendedSignature": "seg_a|seg_b|seg_c"
}
```

**Pipeline**

1. Enumerate every simple path from origin to destination.
2. Build a duration distribution per leg — real history where there is enough
   of it, shrunk toward the template's expectation where there is not.
3. Apply weather (shifts the mean) and traffic (shifts the mean *and* widens
   the spread — this is what makes rail win in the rain).
4. Layer in transfer risk: expected minutes lost to a missed connection.
5. Monte Carlo the joint distribution, read P50/P75/P90/P95 off the totals.
6. Score reliability, blend toward neutral by how much data exists.
7. Pick the winner: highest reliability, ties broken on P90.

**No LLM is involved anywhere.** The output is arithmetic. Gemini, if enabled,
only rewrites the result as one sentence — the adapter interface has no way to
ask it for a route.

---

## One-tap logging

Logging a commute never requires typing. Each step is a single tap that
captures a timestamp:

```
Left Home  →  Boarded Bus 10H  →  Got down at Ameerpet
           →  Transferred       →  Reached Moosarambagh
           →  Reached Office
```

Conditions (weather, traffic, crowd) default to your settings and can be
adjusted with one tap on the Today screen. Crowding is recorded as
`isEstimated` so the engine knows the difference between what you told it and
what it assumed. The last event can be undone.

---

## Tech stack

Expo SDK 57 · React Native 0.86 · React 19 · TypeScript (strict) ·
expo-router (NativeTabs) · expo-sqlite · NativeWind v5 + Tailwind v4 ·
TanStack Query · Zustand · Reanimated 4 · Gesture Handler · zod · dayjs ·
Phosphor icons · react-native-svg · Jest

> **On NativeWind v5:** it is a release candidate and is pinned exactly, with
> `react-native-css@3.1.0-rc.0`, because the two must match. The theme tokens
> in `src/constants/theme.ts` are the source of truth; NativeWind classes
> resolve to them through CSS variables published in
> `src/lib/themeVariables.ts`. Bumping either package means re-running the
> bundle check.

---

## License

MIT
