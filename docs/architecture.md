# Architecture

## Layering

The dependency direction is strictly downward. Nothing lower imports anything
above it.

```
app/            routes + view composition only
  └── src/features    view models, state machines, per-feature services
        ├── src/hooks        thin TanStack Query wrappers
        ├── src/engine       the prediction engine (pure, no I/O)
        ├── src/db           SQLite access (the only place SQL lives)
        ├── src/components   presentational only
        ├── src/services     AI, notifications, backup
        └── src/store        theme, query client, zustand stores
              └── src/types / src/utils / src/constants / src/lib
```

### Three rules

1. **No SQL in a screen.** Every statement is in `src/db/queries.ts`, behind a
   typed function. Screens get decoded domain objects.
2. **No business logic in a screen.** The logging state machine is in
   `src/features/logging/plan.ts`; template validation is in
   `src/features/templates/service.ts`; all statistics are in `src/engine`.
3. **The engine never calls out.** `src/engine` takes a graph plus history and
   returns numbers. No database, no clock, no randomness that is not seeded.
   That is what makes 153 unit tests run in nine seconds with no mocks.

---

## State management

| Concern | Tool | Why |
| ------- | ---- | --- |
| Anything read from SQLite | **TanStack Query** | caching, deduplication, invalidation after writes |
| Transient UI state (editor draft, today's conditions) | **Zustand** | survives re-renders, no provider nesting, no reducers |
| Theme, settings | **React Context** | one value, changes rarely |

There is no Redux. The rule of thumb: if it lives in the database it is a
query; if it is a draft that must not be persisted until Save it is a store;
if it is a preference it is context.

Query keys are centralised in `src/store/queryClient.ts` so
`invalidateQueries` cannot drift from what was registered.

---

## Rendering

### NativeTabs, not JS tabs

`app/(tabs)/_layout.tsx` uses `expo-router/unstable-native-tabs`, which
renders the platform's own tab bar — Material 3 bottom navigation on Android,
liquid glass on iOS 26+. NativeTabs does not render headers, so each tab nests
its own Stack:

```
app/(tabs)/(today)/_layout.tsx   ← Stack with native large titles
app/(tabs)/(today)/index.tsx
```

The trade-off is more files than a flat `app/(tabs)/today.tsx`. In exchange:
native headers, large titles, per-tab back stacks, and a tab bar that matches
the platform instead of imitating it.

Android caps native tabs at five, which is exactly what Reach has.

### Theming

`src/constants/theme.ts` holds the canonical MD3 tokens — semantic role names
(`surfaceContainerHigh`, not `grey200`), never raw colour names. Components
read roles through `useTheme()`; no screen ever checks `useColorScheme()`.

Two things consume those tokens:

- **React Native styles** — `theme.type.titleMedium` is pre-resolved to a
  `TextStyle`, so components spread it straight into a `Text`.
- **NativeWind** — `src/lib/themeVariables.ts` publishes the active scheme into
  CSS custom properties that `global.css` references, so `className="bg-surface"`
  follows the theme without a second source of truth.

---

## The database

`src/db/database.ts` opens the database once, sets WAL and foreign keys, and
applies pending migrations. Each migration runs in its own exclusive
transaction and bumps `PRAGMA user_version`, so a crash mid-migration leaves
the database at the last complete version.

`src/db/queries.ts` is the only module containing SQL. Two conventions matter:

- **Row codecs** (`src/types/codecs.ts`) own every type narrowing. SQLite is
  dynamically typed, so `crowdLevel` is validated against the `CROWD_LEVELS`
  union and degrades to `null` rather than producing an out-of-range value.
- **Aggregates happen in SQL.** Deriving 60 days of statistics in JavaScript
  on every render would block the UI thread; `buildHistoryInput` and
  `refreshRouteEdgeStats` do the work in the database.

---

## Performance

- **Transactions for multi-table writes.** `insertTripBundle` writes the trip,
  its events and both snapshots atomically; a half-written trip is impossible.
- **Denormalisation for list views.** `trips.legModes` and the event's
  `fromLabel`/`toLabel` are duplicated at write time so the History list
  renders a route for every card without joining or loading a graph.
- **Pre-computed aggregates.** `route_edges` is refreshed on trip completion,
  so Insights reads numbers rather than re-deriving them.
- **Memoised selectors.** Route enumeration and the prediction pipeline are
  both pure and memoised per input.
- **Incremental history loading.** The History list pages with
  `limit`/`offset` and grows on `onEndReached`.
- **Seeded randomness.** The Monte Carlo is reproducible, which also means it
  can be memoised safely.

---

## Offline-first

Everything works with no network. The only optional network call is the Gemini
explanation, which is off by default and degrades to an on-device
explanation. `src/services/ai/index.ts` exposes one function that never
throws: any failure returns the local explanation.

`expo-notifications` local notifications work in Expo Go; push notifications
would need a development build, and Reach does not use push.

---

## Animation and accessibility

- **Reanimated** for the progress ring, timeline completion, progress bars and
  card entry.
- **Reduced motion** is honoured everywhere: `theme.reducedMotion` zeroes the
  motion durations and components skip animation entirely rather than running
  it faster.
- **Haptics** (`src/lib/haptics.ts`) map semantic events to patterns — light
  for a selection, medium for a logged event, heavy for starting and finishing
  a commute, and a warning notification when you are running behind your own
  P90. Haptics never throw.
- **Touch targets** are at least 48dp; every interactive element has an
  accessibility role, label and — where the action is not obvious — a hint.
- **Text** scales with the OS setting because nothing sets an absolute height
  on a text container.

---

## Testing

`__tests__/` covers the engine, which is where a bug would actually hurt the
user:

| File | Covers |
| ---- | ------ |
| `statistics.test.ts` | percentile interpolation, P90, MAD vs stddev, shrinkage |
| `reliability.test.ts` | component normalisation, weights, confidence, buffer |
| `graph.test.ts` | adjacency, enumeration, branch detection, validation, cycles |
| `penalties.test.ts` | weather, traffic and crowd models |
| `prediction.test.ts` | route selection, determinism, conditions, edge cases |
| `persistence.test.ts` | real SQL against `node:sqlite`: schema, FK ordering, cascade safety |
| `notifications.test.ts` | the notification service degrading when the native module throws |
| `fixtures.ts` | a shared commute graph with three alternative routes |

Almost no mocks and no React. `persistence.test.ts` is a genuine integration
test: it replays the app's real SQL through `node:sqlite`, because the two
worst bugs in this codebase were both invisible to TypeScript, to ESLint and to
a bundle.

Five real bugs were found and fixed while building this; all five are now
regression-locked:

1. **Non-determinism** — the synthetic distribution sampler defaulted to
   `Math.random`, so the app could contradict its own leave-by time between
   renders.
2. **Condition blindness** — a route with 50 logged trips reported identical
   P90 in clear weather and a downpour, because route-level history was used
   verbatim. The single most important bug in the app, since adjusting for
   conditions is the entire point.
3. **Phantom confidence** — confidence was computed from the Monte Carlo
   sample size rather than real observation count, so a template with no
   history reported full confidence.
4. **`INSERT OR REPLACE` destroying history** — it is a `DELETE` plus an
   `INSERT`, so saving a template cascaded a delete through its stops,
   segments and *entire trip history*, and finishing a commute wiped every
   event logged for it. Now an `ON CONFLICT DO UPDATE` upsert.
5. **Foreign keys violated on first launch** — `insertTripBundle` wrote the
   weather and traffic snapshots before the `trips` row they reference, so
   seeding crashed the app on startup.
