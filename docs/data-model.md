# TollRoad — Data Model

Two stores, each chosen for its access pattern. DynamoDB is the metering hot
path (plus the DJ vector store + session state); Aurora DSQL is the durable
system-of-record for the catalog, accounts, library, ledger, payouts, and mood.

> **Currency: millicents.** Every monetary value is an integer **millicent** = cents × 1000
> (so $10 = 1,000,000 millicents, 1¢ = 1000, and a rate can be 0.5¢/min = 500). This lets
> creators set **sub-cent per-minute rates**. Stripe stays in whole cents at the boundary;
> the sub-cent remainder lives in the artist balance. Field/column names end in `_millicents`.

---

## DynamoDB — table `tollroad` (single-table)

On-demand, `PK`/`SK` strings, `ttl` TTL attribute, `NEW_AND_OLD_IMAGES` stream,
sparse `GSI1`.

| Item | PK | SK | Attributes | Notes |
|---|---|---|---|---|
| **Listener balance** | `USER#<userId>` | `BAL` | `balanceMillicents`, `updatedAt` | Authoritative real-time balance. Decremented with a **conditional** `UpdateItem` (`balanceMillicents >= :cost`) → hard stop-at-zero on the hot path. |
| **Metered minute** | `USER#<userId>` | `EVT#<minuteEpoch>#<trackId>` | `type="METER"`, `userId`, `trackId`, `artistId`, `minuteEpoch`, `amountMillicents`, `idempotencyKey`, `ttl`, `GSI1PK=ARTIST#<artistId>`, `GSI1SK=EVT#<minuteEpoch>` | Written by `POST /v1/charge` (the command path), atomically with the balance debit. `type="METER"` is the stream filter that drives the projector. `ttl` is **generous** (30 days) — never expire a minute before it's durable in the ledger. |
| **Top-up** | `USER#<userId>` | `TOPUP#<paymentRef>` | `type="TOPUP"`, `userId`, `paymentRef`, `amountMillicents`, `feeCents`, `method`, `status` | Written when a balance credit lands (Stripe / demo / onboarding gift / mood reward). Idempotent on `paymentRef`; the projector inserts `wallet_topups` and reconciles the DSQL balance. No TTL. |
| **Track vector** | `TVEC` | `<trackId>` | `embedding` (1024-dim **Bedrock Titan v2** vector, normalised), `updatedAt` | The Vibe-DJ vector store. `/discover` embeds the vibe string, loads this partition, and ranks by cosine similarity (`domain/discovery.ts`). One partition — fine at demo scale. |
| **DJ session** | `SESSION#<sessionId>` | `META` | `context`, `played[]`, `ownerId`, `ttl` | Stateful no-repeat DJ queue behind `/sessions` + `/sessions/{id}/next`. Persisted so `next` can skip already-played tracks. |

### Hot-path write (`POST /v1/charge`, ~once per minute played)

One atomic `TransactWriteItems` — the conditional debit and the guarded meter event
commit together or not at all:

```
TransactWriteItems [
  Update  PK=USER#<u> SK=BAL
    ADD balanceMillicents :neg, SET updatedAt = :now
    ConditionExpression: balanceMillicents >= :cost      # stop-at-zero
  Put     PK=USER#<u> SK=EVT#<min>#<t>              # type=METER → Streams → projector
    ConditionExpression: attribute_not_exists(PK)    # one event per unique minute
    idempotencyKey = '<u>#<t>#<min>'
]
```

A separate `GET /v1/stream/{trackId}` then issues a short-TTL CloudFront **signed URL**
once `hasRecentMeter` confirms a recent paid minute. **Liking** a track (`POST
/v1/library/likes`) runs the same conditional debit (1¢) and inserts the `likes` row
in the same transaction (`domain/billing.chargeLike`); unliking is free and never
refunds.

`idempotencyKey = user#track#minute` is the dedup anchor that makes the
downstream ledger exactly-once.

---

## Aurora DSQL — system-of-record

PostgreSQL-16 wire-compatible, **OLTP**, scale-to-zero. Designed around DSQL's
grain: **no foreign keys / triggers / PL-pgSQL** (integrity in the app + the
projector), secondary indexes via `CREATE INDEX ASYNC`, **append-only** ledger to
avoid OCC hotspots, precomputed summary for BI. Most `ADD COLUMN`s are nullable
because DSQL rejects `ADD COLUMN` with a default/constraint. Canonical DDL lives in
[`../infra/scripts/migrate-dsql.mjs`](../infra/scripts/migrate-dsql.mjs) (catalog,
accounts, library, ledger, payouts) and [`../backend/scripts/migrate-mood.mjs`](../backend/scripts/migrate-mood.mjs)
(the Vibe-Pad mood tables).

### Catalog & accounts

```
artists(id PK, name, created_at,
  email, genre, bio, location, website, avatar_key,   -- profile
  account_id,                                          -- links to the owning account (NULL = demo-seeded)
  stripe_account_id, payouts_enabled)                  -- Stripe Connect (Express) payouts
                                                       -- idx: email, stripe, account
tracks(id PK, artist_id, title, duration_seconds,
  price_per_minute_millicents DEFAULT 1000,            -- 0 (free) … 100000 ($1/min), 0.1¢ steps
  audio_key, cover_image_key, is_active,               -- is_active NULL → treated as active (soft delete)
  created_at)                                          -- idx: by artist

accounts(user_id PK, created_at,                       -- unified auth identity = royalty_ledger.user_id
  email, handle, display_name, auth_method,
  claimed_at,                                          -- NULL = anonymous device; OTP sign-in upgrades in place
  last_login_at, referred_by)                          -- referred_by = account from a shared-playlist ?r=<handle>
                                                       -- idx: handle, email
listener_profiles(account_id PK,                       -- a prepaid balance the meter draws against
  balance_millicents DEFAULT 0,                        -- DSQL reconciliation balance (durable mirror of DynamoDB BAL)
  onboarding_gift_claimed_at,                          -- one-time $3 gift idempotency stamp
  created_at)
auth_otp(email PK, code_hash, attempts_left,           -- email OTP challenges (salted hash only)
  sent_at, send_count, expires_at)
```

### Ledger, summaries, top-ups, payouts

```
royalty_ledger(                       -- APPEND-ONLY, one row per metered minute (SoR)
  idempotency_key PK,                 -- '<user>#<track>#<minute>'  (dedup)
  user_id, track_id, artist_id,
  minute_epoch, amount_millicents, created_at)               -- idx: (artist,minute), (user,minute)

artist_daily_summary(                 -- PRECOMPUTED BI (no ledger scans)
  artist_id, day, minutes, amount_millicents,
  PRIMARY KEY(artist_id, day))

wallet_topups(payment_ref PK,         -- one row per funded top-up; PK = Stripe PaymentIntent / demo ref
  account_id, amount_millicents, fee_cents, method, status, created_at)  -- method: ach|card|demo

payout_transfers(id PK, artist_id,    -- withdrawal ledger, one row per payout attempt
  amount_millicents, stripe_transfer_id,
  status, created_at)                 -- status: pending|paid|failed
                                      -- available = SUM(ledger) - SUM(transfers WHERE status <> 'failed')
```

### Listener library

Each a clean point/range query (no ledger scans). No FKs; ownership scoped on
`account_id` in the app.

```
likes(account_id, track_id, created_at,
  PRIMARY KEY(account_id, track_id))                          -- idx: account, created_at
playlists(id PK, account_id, name, cover_track_id,
  visibility, created_at)                                     -- visibility NULL/absent = private; 'public' = unauth-readable
playlist_tracks(playlist_id, track_id, position, added_at,
  PRIMARY KEY(playlist_id, track_id))                          -- idx: playlist, position
recently_played(account_id, track_id, played_at,              -- UPSERT on play
  PRIMARY KEY(account_id, track_id))                           -- idx: account, played_at DESC
```

### Vibe-Pad mood (timeseries → consensus → AI tags)

`v`/`e` are JSONB arrays on a fixed 250 ms grid; a released-puck gap is a SQL
`NULL` element. Consensus and reward are computed **in DSQL** with vanilla window
functions — no timeseries DB, no extensions. The consensus table *is* the
AI-tagging training set.

```
mood_traces(trace_id PK, user_id, song_id, created_at,
  duration_ms, grid_ms, sample_count, coverage_pct,
  agreement, reward_millicents, v JSONB, e JSONB,
  UNIQUE(user_id, song_id))                                   -- re-reaction = UPSERT; idx: user, created_at
song_consensus(song_id PK, grid_ms, v JSONB, e JSONB,        -- binned crowd curve, one row per song
  trace_count, updated_at)
song_mood_tags(song_id PK, dominant_quadrant, arc_label,    -- rule-based tags from consensus
  valence_mean, energy_mean, confidence, source, updated_at) -- source: 'human' | 'predicted'
```

### CQRS plumbing

```
projector_checkpoint(shard_id PK, last_seq, updated_at)       -- last stream seq per shard (observability)
```

> **Superfan bonds have no table.** Bond points, tiers, streaks, fan counts, and
> the per-artist leaderboard are **derived in-SQL** from `royalty_ledger`
> (`domain/superfan.ts` + `bondMath`), so they can't drift from real spend.

### Rollup (DynamoDB Streams → Lambda projector)

Per `type=METER` event, in one transaction (retried on `40001`):

```sql
INSERT INTO royalty_ledger (...) VALUES (...)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING idempotency_key;            -- newly inserted?  (replay = no-op)

-- only when newly inserted, so duplicates never inflate earnings:
INSERT INTO artist_daily_summary (artist_id, day, minutes, amount_millicents)
  VALUES ($artist, to_timestamp($min*60)::date, 1, $amount)
  ON CONFLICT (artist_id, day)
  DO UPDATE SET minutes = artist_daily_summary.minutes + 1,
                amount_millicents = artist_daily_summary.amount_millicents + EXCLUDED.amount_millicents;
```

`type=TOPUP` events project into `wallet_topups` and reconcile
`listener_profiles.balance_millicents`. The projector is the **sole DSQL writer**
and runs as a least-privilege DML role (see the migration's gated `projector` role).

### Read paths

| Read | Query |
|---|---|
| Catalog | `tracks` ⋈ `artists` (app-side join key; no FK) |
| Listener spend / play history | `royalty_ledger WHERE user_id = …` (the rows you paid for *are* your history) |
| Artist statement / dashboard | `artist_daily_summary WHERE artist_id = … AND day BETWEEN …` (cheap point/range — never scans the ledger) |
| Library | `likes` / `playlists` ⋈ `playlist_tracks` / `recently_played`, all scoped on `account_id` |
| Superfan bond / leaderboard | aggregate `royalty_ledger` per fan, ranked (`domain/superfan.ts`) |
| Available payout balance | `SUM(royalty_ledger) − SUM(payout_transfers WHERE status <> 'failed')` |
| Mood consensus / reward | window-function rollup over `mood_traces` → `song_consensus` |

---

## Why this split

- **Conditional, single-digit-ms balance decrement** + **TTL firehose** + **Streams-as-trigger** + **cheap vector partition / session state** → DynamoDB. (Justified by access pattern, not volume — at demo scale the write rate is trivial.)
- **ACID append-only ledger, relational catalog + library + payouts, in-SQL mood consensus, scale-to-zero between billing runs** → Aurora DSQL.
