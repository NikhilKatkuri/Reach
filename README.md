# Reach

**Template-based personal commute prediction app (In Development)**

Reach is a planned Expo + TypeScript application that will help users arrive on time by learning from their own commute history. The app is designed around low-friction trip logging, route reliability analysis, and simple prediction rather than complex AI automation.

---

## Project Status

**Current stage:** Planning & data-model implementation

* [ ] Create commute templates
* [ ] Implement one-tap event logging
* [ ] Store trips in SQLite
* [ ] Build route graph
* [ ] Compute P90 travel times
* [ ] Generate route recommendations
* [ ] Add optional Gemini explanations

---

## Goal

The goal of Reach is to recommend the **most reliable route**, not necessarily the fastest route.

The system will use:

* Historical travel times
* Transfer success/failure
* Crowd levels
* Traffic levels
* Weather conditions

to estimate the probability of reaching a destination on time.

---

## Planned Features

### Template-based setup

Create a commute once:

* Home → Stop A
* Bus 10H → Stop B
* Bus 216 → Stop C
* Choose D→E or F route

### One-tap logging

Daily actions will be reduced to simple confirmations:

* Left Home
* Boarded Bus
* Got Down
* Transfer
* Reached Destination

### Reliability analytics

* Average travel time
* P90 travel time
* On-time probability
* Route comparison
* Delay trends

### Recommendation card

Example planned output:

```text
Leave by: 8:02 AM
Route: C → D → E
ETA: 8:46 AM
On-time probability: 92%
```

---

## Planned Tech Stack

* **Expo**
* **React Native**
* **TypeScript**
* **expo-sqlite**
* **expo-notifications**
* **dayjs**
* **zod**
* **Google Gemini API** for natural-language explanations

---

## Planned Architecture

```text
Expo App
   ↓
Template State Machine
   ↓
SQLite (events + graph)
   ↓
Prediction Engine (P90 + reliability)
   ↓
Recommendation Card
   ↓
Optional AI Explanation
```

---

## Data Model (Planned)

read [data_model.md](./data_model.md)

---

## Prediction Strategy

The route selection is planned to be **statistical rather than LLM-driven**.

The engine will:

1. Build candidate routes
2. Estimate travel time
3. Compute P90 duration
4. Apply weather and traffic penalties
5. Compare on-time probability
6. Select the safest route

If Gemini is added, it will be used only to explain the recommendation.

---

## Planned Folder Structure

```text
app/
  (tabs)/
    today.tsx
    history.tsx
    templates.tsx

src/
  db/
  engine/
  types/
  components/
  hooks/
```

---

## Roadmap

### v1

* [ ] Templates
* [ ] One-tap logging
* [ ] SQLite storage
* [ ] P90 calculation
* [ ] Recommendation card

### v2

* [ ] Alarm scheduling
* [ ] Daily buffer suggestions
* [ ] Rain-specific adjustments
* [ ] Reliability charts

### v3

* [ ] Cloud backup
* [ ] Multi-device sync
* [ ] Background trip detection
* [ ] Live share hub integration

---

## Philosophy

Reach is being designed around three principles:

* **Low friction** — no repeated typing
* **Local first** — data stays on the device
* **Reliable over fastest** — being on time matters more than saving a few minutes

---

## License

MIT