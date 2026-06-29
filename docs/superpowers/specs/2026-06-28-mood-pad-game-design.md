# Vibe Pad — Mood-Tagging Mini-Game (Design Spec)

**Date:** 2026-06-28
**Status:** Approved direction; spec under review
**Context:** TollRoad Music. Built for **H0: Hack the Zero Stack with Vercel v0 and AWS Databases** (deadline 2026-06-29). Eligible AWS databases: Aurora PostgreSQL, **Aurora DSQL**, **DynamoDB** (we use the latter two — already in our stack).

## 1. Concept

A mini-game inside the listening experience. While a song plays, the listener drags a puck around a 4-quadrant **valence × energy** grid to "set the tone" of each moment. The artifact is a **mood trace**: a time-aligned path through the valence/energy plane for one play of one song.

- **Grid (Russell's circumplex):** X = valence (negative→positive), Y = energy (calm→energetic). Quadrants: Hype (↑right), Tense/Angry (↑left), Sad/Melancholy (↓left), Chill/Serene (↓right). The gradient between is a continuous blend.
- **Capture:** live drag while the song plays; samples snapped to a fixed **250ms grid**, `v,e ∈ [-1,1]`; `NULL` where the puck is released (gaps = no signal).
- **Reward:** listeners earn **free listening-minutes** (credited as millicents), weighted by how well their trace agrees with the **crowd consensus**, plus a bootstrap bonus for early raters.
- **Output:** the per-song consensus mood-timeline feeds **AI tagging** — rule-based tags now, an audio→emotion model for cold songs later. The game's output *is* the training dataset.

**v1 scope:** feelings only (valence/energy). Free-text/word "ideas" tagging is deferred to v2.

## 2. The Database Story (judging centerpiece)

Polyglot persistence, each DB on its strengths — and the clever bit is that **crowd consensus is computed in distributed SQL, not app code.**

| Store | Role | Why |
|---|---|---|
| **DynamoDB** | (a) Authoritative wallet balance (existing `USER#<id>/BAL`). (b) *Stretch:* high-frequency live sample ingest (`REACTION_LIVE`, TTL'd) + **DynamoDB Streams** → live "crowd ghost". | Eats tiny high-volume writes; free change-stream for sub-second realtime. Money authority unchanged from today. |
| **Aurora DSQL** | Durable mood traces + **in-SQL consensus & agreement** + ML training export. | AWS's newest serverless distributed Postgres (scale-to-zero → on-theme with "Zero Stack"). Analytical timeseries SQL via `generate_series`/`LATERAL`/window funcs — no extensions, no timeseries DB. |

**Talking points:** (1) "Mood is a timeseries; we compute crowd consensus with vanilla distributed-SQL window functions in Aurora DSQL — no timeseries DB, no extensions." (2) "Consensus and reward are *queries*, not services." (3) "DynamoDB Streams drives a sub-second live crowd-ghost." (4) "The consensus table is literally our ML training set." (5) Deliberate single-table-vs-relational split across the two DBs.

**Caveat:** DSQL is Postgres-*compatible*, not full Postgres (feature subset, no extensions). The design uses only vanilla SQL (`generate_series`, `generate_subscripts`, `LATERAL`, CTEs, `FILTER`, window funcs). **Verify DSQL support for each at build time** against `backend/src/lib/dsql.ts` usage + AWS docs before relying on them.

## 3. Data Flow

```
LISTEN (drag puck, sampled @250ms grid)
  client buffers samples {bin, v, e}  (NULL where released)
  │
  ├─[realtime, STRETCH]→ POST /v1/mood/live  (batch ~every 500ms)
  │      → DynamoDB REACTION_LIVE (TTL ≈ song len) ──Streams──▶ live-consensus aggregator
  │                                                              └─▶ crowd ghost pushed to player
  │
  └─[song end]→ POST /v1/mood/trace  (whole trace, one write)
         → DSQL mood_traces (durable system of record)
         → agreement = SQL query vs current song_consensus
         → reward_millicents = f(agreement, coverage) (+bootstrap)
         → credit via existing DynamoDB BAL path (creditTopup-style, idempotent)
         → refresh song_consensus (DSQL)
```

Money authority stays in DynamoDB (matches today's billing). Consensus/analytics live in DSQL. DynamoDB's realtime role is ephemeral fuel for the ghost only — not the system of record.

## 4. Data Model

**DynamoDB (ephemeral realtime; stretch only):**
- `REACTION_LIVE` — PK `SONG#<songId>`, SK `USER#<userId>#<bin>`, attrs `v,e`, `TTL` ≈ song length + buffer.

**Aurora DSQL (durable + analytical):**
- `mood_traces(trace_id, user_id, song_id, created_at, duration_ms, grid_ms, sample_count, coverage_pct, agreement, reward_millicents, v real[], e real[])` — one row per trace; samples as parallel grid-aligned arrays (index = time bin). `UNIQUE(user_id, song_id)` — re-reacting updates the row.
- `song_consensus(song_id PK, grid_ms, v real[], e real[], trace_count, updated_at)` — binned crowd curve on the shared grid. Source for both the ghost and AI tagging.
- `song_mood_tags(song_id PK, dominant_quadrant, arc_label, valence_mean, energy_mean, confidence, source ENUM('human','predicted'), updated_at)` — Phase C output.

## 5. Consensus & Reward (the SQL)

**Consensus — average each grid bin across all traces:**
```sql
WITH samp AS (
  SELECT g.idx AS bin, t.v[g.idx] AS v, t.e[g.idx] AS e
  FROM mood_traces t
  CROSS JOIN LATERAL generate_subscripts(t.v, 1) AS g(idx)
  WHERE t.song_id = $1
)
SELECT bin,
       avg(v) FILTER (WHERE v IS NOT NULL) AS cv,
       avg(e) FILTER (WHERE e IS NOT NULL) AS ce,
       count(v) AS n
FROM samp GROUP BY bin ORDER BY bin;
```

**Agreement — your normalized distance from the crowd:**
```sql
-- 1 − mean euclidean distance / √8 (diagonal of [-1,1]²); only bins you reacted in
SELECT 1 - avg( sqrt((me.v-c.cv)^2 + (me.e-c.ce)^2) / sqrt(8.0) )
FROM my_trace_bins me JOIN consensus_bins c USING (bin)
WHERE me.v IS NOT NULL;
```

**Reward:**
```
reward_millicents = REWARD_MILLICENTS_PER_MIN × BASE_MIN × clamp(agreement^γ, 0, 1) × coverage_pct
```
- `coverage_pct` = bins-with-signal / total-bins.
- **Bootstrap:** if `song_consensus.trace_count < BOOTSTRAP_N` at submit time, agreement is untrustworthy → pay a flat `BOOTSTRAP_MILLICENTS × coverage_pct` and flag for audit. No retroactive clawback.
- `γ` (≈1.5–2) sharpens so only genuine alignment pays well; random input ≈ 0.
- **Caps:** one reward per `(user, song)`; max `DAILY_REWARDED_REACTIONS` per user/day.
- Constants (`REWARD_MILLICENTS_PER_MIN`, `BASE_MIN`, `BOOTSTRAP_N`, `BOOTSTRAP_MILLICENTS`, `γ`, `DAILY_REWARDED_REACTIONS`) tuned during B2.

## 6. AI Tagging (Phase C)

- **Rule-based (immediate):** from `song_consensus` derive `dominant_quadrant` (sign of mean v,e), `arc_label` (trajectory, e.g. "builds Chill→Hype"), `confidence` (trace_count + agreement spread). Write `song_mood_tags(source='human')`; surface on TrackCard/catalog.
- **Cold-song model (optional/stretch):** export labeled timeseries from DSQL → train audio→(valence,energy)-timeline regressor → predict for songs with `trace_count < TAG_MIN` → `source='predicted'`, visually distinguished. Pluggable behind an interface; v1 may ship only the export job + interface stub.

## 7. Anti-Abuse

- **Real-listen gate:** reward requires `billedSec ≥ 0.70 × duration` (reuse existing metering).
- **Minimum coverage + motion variance** to qualify for reward (degenerate/parked traces earn nothing; still stored as data).
- **Consensus weighting** self-polices random input (agreement ≈ 0 → ~no reward).
- **Rate limits:** one reward per `(user, song)`; daily rewarded cap; bootstrap rewards flagged.
- All rewards tied to authenticated accounts.

## 8. Frontend

- **`MoodPad`** component: SVG/canvas 4-quadrant gradient field; puck follows pointer; optional translucent crowd-ghost trail. Samples at 250ms via interval gated on `playing` from `usePlayer()` (`cur`/`dur` for time sync). Mounted in `FullscreenPlayer` via `createPortal` (existing overlay pattern). "Set the tone" entry point; reward reveal on submit ("+0.8 min · 87% in tune").
- Styling: CSS Modules + existing design tokens (asphalt/amber/bone) in `globals.css`. No Tailwind.
- Thin `MoodProvider` (or `usePlayer` extension) + API client methods: `postMoodTrace`, `getConsensus`, *(stretch)* `postMoodLive`.

## 9. Backend

- New handlers under `backend/src/handlers/mood.ts`; routes in `router.ts`: `POST /mood/trace` (durable submit + score + reward), `GET /mood/consensus/{songId}` (ghost + tags), *(stretch)* `POST /mood/live` (Dynamo ingest).
- DSQL access via `query<T>()` (`lib/dsql.ts`); reward credit via existing DynamoDB billing path (`domain/billing.ts` / `wallet-store.ts`), idempotent on a reaction ref.
- Auth via `requireSession(req)`; responses via `ok()`/`error()`.

## 10. Milestones

- **A1** — DSQL migrations (`mood_traces`, `song_consensus`, `song_mood_tags`) + DynamoDB `REACTION_LIVE` table.
- **A2** — `MoodPad` capture UI + sampling + `POST /mood/trace` storing the durable trace.
- **B1** — consensus SQL + `song_consensus` rollup on submit.
- **B2** — agreement scoring + reward crediting + anti-abuse + caps + reward reveal UI.
- **B3** *(stretch)* — DynamoDB live ingest + Streams aggregator + live crowd-ghost.
- **C1** — rule-based `song_mood_tags` from consensus + surface in catalog.
- **C2** *(optional)* — training export from DSQL + cold-song audio→emotion model.

## 11. Open Questions / Verify at Build

1. Confirm DSQL supports `generate_subscripts`, `LATERAL`, `FILTER`, array indexing, `generate_series` (test against live DSQL early in A1).
2. Reference rate for `REWARD_MILLICENTS_PER_MIN` (fixed platform rate vs. per-track price) — decide in B2.
3. Whether B3 live-ghost is in scope for the 06-29 deadline or post-hackathon.
4. Shared-DSQL-across-worktrees hazard: migrations affect all local checkouts (per project memory) — coordinate before running A1 migrations.
