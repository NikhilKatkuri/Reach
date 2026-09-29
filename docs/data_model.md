# Data model

Reach stores everything in one local SQLite database (`reach.db`). There is no
server and no sync: the file on the device is the source of truth.

All identifiers are UUID v4. All timestamps are **epoch milliseconds**
(`INTEGER`). All booleans are stored as `INTEGER` 0/1 and converted at the
codec boundary.

---

## The core idea: a template is a graph

A commute template is a directed graph.

- **stops** are nodes
- **segments** are directed edges (`fromStopId → toStopId`)

An "alternative branch" is not a separate concept. It is simply two or more
outgoing edges from the same stop:

```
Home ─walk─▶ Bus Stop A ─bus 10H─▶ Ameerpet
                              │         ├─metro Blue─▶ Moosarambagh ─walk─▶ HITAM
                              └─bus 216─▶ JNTU        └─walk────────▶ Moosarambagh
```

Both edges out of `Ameerpet` are alternatives; both edges out of
`Bus Stop A` are alternatives. The engine enumerates all simple paths and
scores each one, so a branch needs no special handling anywhere in the code.

The first stop in `sortOrder` is the origin; the last is the destination.

---

## Tables

### `templates`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | TEXT PK | UUID |
| `name` | TEXT | e.g. `Home → HITAM` |
| `originName` | TEXT | denormalised for the list UI |
| `destinationName` | TEXT | ditto |
| `colorSeed` | TEXT | future per-commute theming |
| `notes` | TEXT? | |
| `isArchived` | INTEGER | archived templates are hidden |
| `isDefault` | INTEGER | the template Today shows |
| `sortOrder` | INTEGER | manual ordering |
| `createdAt` / `updatedAt` | INTEGER | |

### `stops`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | TEXT PK | |
| `templateId` | TEXT FK → `templates` | `ON DELETE CASCADE` |
| `name` | TEXT | `Bus Stop A` |
| `kind` | TEXT | `home` · `stop` · `station` · `office` |
| `latitude` / `longitude` | REAL? | optional |
| `sortOrder` | INTEGER | position in the journey |
| `createdAt` / `updatedAt` | INTEGER | |

Index: `(templateId, sortOrder)`.

### `segments` — the graph edges

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | TEXT PK | |
| `templateId` | TEXT FK | `ON DELETE CASCADE` |
| `fromStopId` | TEXT FK → `stops` | `ON DELETE CASCADE` |
| `toStopId` | TEXT FK → `stops` | `ON DELETE CASCADE` |
| `mode` | TEXT | `walk` · `bus` · `metro` · `train` · `auto` · `bike` · `cab` |
| `serviceLabel` | TEXT? | `Bus 10H`, `Metro Blue` |
| `expectedDurationMin` | INTEGER | the prior when there is no history |
| `bufferMinutes` | INTEGER | explicit slack added on top |
| `transferWindowMin` | INTEGER? | minutes available to catch the connection |
| `branchGroup` | TEXT? | labels related edges in the builder |
| `branchLabel` | TEXT? | `Via Ameerpet`, `Bus only` |
| `sortOrder` | INTEGER | |
| `createdAt` / `updatedAt` | INTEGER | |

Indexes: `(templateId, sortOrder)`, `(fromStopId)`, `(toStopId)`,
`(templateId, branchGroup)`.

### `trips`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | TEXT PK | |
| `templateId` | TEXT FK | `ON DELETE CASCADE` |
| `routeSignature` | TEXT? | `seg_a\|seg_b\|seg_c` — the route's identity and stats key |
| `legModes` | TEXT? | pipe-joined mode mix, denormalised for the History list |
| `direction` | TEXT | `outbound` · `inbound` |
| `status` | TEXT | `active` · `completed` · `abandoned` |
| `startedAt` / `endedAt` | INTEGER | |
| `targetArrivalAt` | INTEGER? | the deadline this trip was planned against |
| `plannedDurationMin` | INTEGER? | P50 at the time logging started |
| `actualDurationMin` | INTEGER? | |
| `delayMinutes` | INTEGER? | actual − planned |
| `onTimeProbability` | REAL? | what the engine predicted |
| `reliabilityScore` | REAL? | 0..100 |
| `wasOnTime` | INTEGER? | actual arrival ≤ target |
| `weatherSnapshotId` / `trafficSnapshotId` | TEXT? | |
| `note` | TEXT? | |
| `createdAt` / `updatedAt` | INTEGER | |

Indexes: `(templateId, startedAt DESC)`, `(startedAt DESC)`,
`(status, startedAt DESC)`, `(templateId, routeSignature, startedAt DESC)`.

`onTimeProbability` and `reliabilityScore` are stored so the History screen
can show *prediction vs outcome* without re-running the engine.

### `events` — the one-tap log

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | TEXT PK | |
| `tripId` | TEXT FK → `trips` | `ON DELETE CASCADE` |
| `segmentId` | TEXT? FK → `segments` | `ON DELETE SET NULL` |
| `kind` | TEXT | `depart` · `board` · `alight` · `transfer` · `arrive` · `miss` |
| `label` | TEXT | `Boarded Bus 10H` |
| `mode` | TEXT? | denormalised for the timeline |
| `fromLabel` / `toLabel` | TEXT? | denormalised stop names |
| `occurredAt` | INTEGER | the tap timestamp |
| `elapsedMinutes` | INTEGER | since `trips.startedAt` |
| `deltaMinutes` | INTEGER? | actual − expected for this leg |
| `crowdLevel` | INTEGER? | 0..5, see below |
| `trafficLevel` | TEXT? | |
| `isEstimated` | INTEGER | 1 when inferred rather than told |
| `undone` | INTEGER | soft delete for one-tap undo |
| `sortOrder` | INTEGER | |
| `createdAt` / `updatedAt` | INTEGER | |

Indexes: `(tripId, sortOrder)`, `(occurredAt)`, `(segmentId)`.

Undo sets `undone = 1` rather than deleting, so a mis-tap is recoverable and
the audit trail stays intact.

**`crowdLevel`**

| Value | Meaning |
| ----- | ------- |
| 0 | empty |
| 1 | seat available |
| 2 | moderate (standing, some space) |
| 3 | standing comfortable |
| 4 | packed |
| 5 | very difficult to board |

### `weather_snapshots`

`id`, `tripId?`, `condition`, `temperatureC?`, `feelsLikeC?`, `rainfallMm?`,
`humidityPct?`, `windKph?`, `isManual`, `observedAt`, `createdAt`, `updatedAt`.

`condition` is one of `clear` · `cloudy` · `light_rain` · `rain` ·
`heavy_rain`.

v1 has no weather feed, so a snapshot only ever comes from the user — one tap
on a chip in the Today screen. `isManual` records that, so a future feed can be
told apart from an observation.

### `traffic_snapshots`

`id`, `tripId?`, `level`, `delayMinutes`, `sourceSegmentId?`, `isManual`,
`observedAt`, `createdAt`, `updatedAt`.

`level` is one of `low` · `medium` · `high` · `very_high`.

### `route_edges` — pre-computed route statistics

One row per `(routeSignature, segmentId)`. Recomputed after every completed
trip so the Insights screen and the engine read numbers rather than
re-deriving them on every render.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | TEXT PK | `<signature>:<segmentId>` |
| `templateId` | TEXT FK | `ON DELETE CASCADE` |
| `routeSignature` | TEXT | |
| `segmentId` | TEXT FK | `ON DELETE CASCADE` |
| `position` | INTEGER | position in the route |
| `totalDurationMin` | INTEGER | mean total, rounded |
| `observations` | INTEGER | completed trips on this route |
| `avgDurationMin` | REAL? | |
| `p50DurationMin` / `p90DurationMin` / `p95DurationMin` | REAL? | |
| `stddevMinutes` | REAL? | |
| `onTimeRate` | REAL? | 0..1 |
| `missedTransfers` | INTEGER | |
| `createdAt` / `updatedAt` | INTEGER | |

Unique index on `(routeSignature, segmentId)`.

### `settings`

`key` (TEXT PK), `value` (TEXT, JSON-encoded), `updatedAt`.

Keys are namespaced — `app.theme`, `conditions.defaultWeather`,
`notifications.leadMinutes`, `ai.geminiApiKey`, and so on. See
`src/constants/settings.ts` for the full list and the parser for each, so a
corrupt value falls back to its default instead of breaking startup.

### `schema_migrations`

`version` (INTEGER PK), `name`, `appliedAt`. The authoritative marker is
`PRAGMA user_version`; this table is a human-readable log.

---

## Route signatures

A route is identified by the `|`-joined list of its segment ids:

```
seg-walk-to-stand|seg-bus-to-ameerpet|seg-metro-to-moosarambagh|seg-walk-to-office
```

This is deliberate. It is:

- **stable** across sessions, so statistics accumulate correctly
- **self-describing**, so the History list can render a route without a join
- **hashable**, so the engine can seed its Monte Carlo from the route id and
  get the same answer every time

The downside is that editing a template changes segment ids and therefore
orphans its history. For v1 that is the right trade: a materially edited route
*is* a different commute, and silently blending the two would be worse.

---

## Migrations

`src/db/migrations/index.ts` is an ordered, append-only list. Each migration
runs inside its own transaction and bumps `PRAGMA user_version`, so a crash
mid-migration leaves the database at the last complete version.

Rules for adding one:

1. Never edit a released migration — append a new one.
2. `version` must increase and must not have gaps.
3. `up` must be safe on a fresh database.
4. Prefer static `up` statements, because those are what the integration test
   replays. Use `customize` only when a step has to inspect the database first.

### Version history

| Version | Name | What it did |
| --- | --- | --- |
| 1 | `initial_schema` | The whole schema: templates, stops, segments, trips, events, weather, traffic, route edges, settings. |
| 2 | `purge_demo_data` | Deletes every row the removed demo seeder had written, and repairs `trips.legModes` on databases created before that column existed. |

Version 2 deletes children explicitly instead of leaning on `ON DELETE CASCADE`,
because an early build could open the database before
`PRAGMA foreign_keys = ON` took effect, leaving orphans that a cascade would
not have removed. Its `customize` step exists because SQLite has no
`ADD COLUMN IF NOT EXISTS`, and a duplicate-column error would roll back the
purge — leaving the demo rows in place, which is the one outcome the migration
exists to prevent.

---

## First launch

A fresh install is **empty**. There is no sample data, by design.

Every number Reach shows — P50, P90, reliability, the crowd heatmap — is derived
from trips the user actually logged. Seeding synthetic history would make the
dashboard look impressive while teaching the user to trust numbers that have
nothing to do with their commute, and it would make the engine's confidence
score meaningless from the first launch.

The consequence is that the first-run experience is an empty state rather than
a populated dashboard, so those states are designed deliberately: the Today
screen explains what the app will produce and offers one action, and Insights
names the exact trip count before it will show a number.
