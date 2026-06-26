# TollRoad — Data Model

Two stores, each chosen for its access pattern. DynamoDB is the metering hot
path; Aurora DSQL is the durable system-of-record.

---

## DynamoDB — table `tollroad` (single-table)

On-demand, `PK`/`SK` strings, `ttl` TTL attribute, `NEW_AND_OLD_IMAGES` stream,
sparse `GSI1`.

| Item | PK | SK | Attributes | Notes |
|---|---|---|---|---|
| **Listener balance** | `USER#<userId>` | `BAL` | `balanceCents`, `updatedAt` | Authoritative real-time balance. Decremented with a **conditional** `UpdateItem` (`balanceCents >= :cost`) → hard stop-at-zero on the hot path. |
| **Metered minute** | `USER#<userId>` | `EVT#<minuteEpoch>#<trackId>` | `type="METER"`, `userId`, `trackId`, `artistId`, `minuteEpoch`, `amountCents`, `idempotencyKey`, `ttl`, `GSI1PK=ARTIST#<artistId>`, `GSI1SK=EVT#<minuteEpoch>` | Written by `POST /v1/charge` (the command path), atomically with the balance debit. `type="METER"` is the stream filter that drives the projector. `ttl` is **generous** (30 days) — never expire a minute before it's durable in the ledger. |
| **Top-up** | `USER#<userId>` | `TOPUP#<paymentRef>` | `type="TOPUP"`, `userId`, `paymentRef`, `amountCents`, `feeCents`, `method`, `status` | Written when a balance credit lands (Stripe / demo / onboarding gift). Idempotent on `paymentRef`; the projector inserts `wallet_topups` and reconciles the DSQL balance. No TTL. |

### Hot-path write (`POST /v1/charge`, ~once per minute played)

One atomic `TransactWriteItems` — the conditional debit and the guarded meter event
commit together or not at all:

```
TransactWriteItems [
  Update  PK=USER#<u> SK=BAL
    SET balanceCents = balanceCents - :cost, updatedAt = :now
    ConditionExpression: balanceCents >= :cost      # stop-at-zero
  Put     PK=USER#<u> SK=EVT#<min>#<t>              # type=METER → Streams → projector
    ConditionExpression: attribute_not_exists(PK)    # one event per unique minute
    idempotencyKey = '<u>#<t>#<min>'
]
```

A separate `GET /v1/stream/{trackId}` then issues a short-TTL CloudFront **signed URL**
once `hasRecentMeter` confirms a recent paid minute.

`idempotencyKey = user#track#minute` is the dedup anchor that makes the
downstream ledger exactly-once.

---

## Aurora DSQL — system-of-record

PostgreSQL-16 wire-compatible, **OLTP**, scale-to-zero. Designed around DSQL's
grain: **no foreign keys / triggers / PL-pgSQL** (integrity in the app + the
projector), secondary indexes via `CREATE INDEX ASYNC`, **append-only** ledger to
avoid OCC hotspots, precomputed summary for BI. Canonical DDL lives in
[`../infra/scripts/migrate-dsql.mjs`](../infra/scripts/migrate-dsql.mjs).

```
artists(id PK, name, payout_ref, created_at)
tracks(id PK, artist_id, title, duration_seconds,
       price_per_minute_cents, audio_key, created_at)        -- idx: by artist
accounts(user_id PK, created_at)

royalty_ledger(                       -- APPEND-ONLY, one row per metered minute
  idempotency_key PK,                 -- '<user>#<track>#<minute>'  (dedup)
  user_id, track_id, artist_id,
  minute_epoch, amount_cents, created_at)                    -- idx: artist,minute

artist_daily_summary(                 -- PRECOMPUTED BI (no ledger scans)
  artist_id, day, minutes, amount_cents,
  PRIMARY KEY(artist_id, day))

-- Listener library — new access patterns, each a clean point/range query
-- (no ledger scans). No FKs; ownership scoped on account_id in the app.
likes(account_id, track_id, created_at,
  PRIMARY KEY(account_id, track_id))                          -- idx: account, created_at
playlists(id PK, account_id, name, cover_track_id, created_at) -- idx: account, created_at
playlist_tracks(playlist_id, track_id, position, added_at,
  PRIMARY KEY(playlist_id, track_id))                          -- idx: playlist, position
recently_played(account_id, track_id, played_at,              -- UPSERT on play
  PRIMARY KEY(account_id, track_id))                           -- idx: account, played_at DESC
```

### Rollup (DynamoDB Streams → Lambda)

Per `type=METER` event, in one transaction (retried on `40001`):

```sql
INSERT INTO royalty_ledger (...) VALUES (...)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING idempotency_key;            -- newly inserted?  (replay = no-op)

-- only when newly inserted, so duplicates never inflate earnings:
INSERT INTO artist_daily_summary (artist_id, day, minutes, amount_cents)
  VALUES ($artist, to_timestamp($min*60)::date, 1, $amount)
  ON CONFLICT (artist_id, day)
  DO UPDATE SET minutes = artist_daily_summary.minutes + 1,
                amount_cents = artist_daily_summary.amount_cents + EXCLUDED.amount_cents;
```

### Read paths

| Read | Query |
|---|---|
| Catalog | `tracks` ⋈ `artists` (app-side join key; no FK) |
| Listener spend history | `royalty_ledger WHERE user_id = …` |
| Artist statement / dashboard | `artist_daily_summary WHERE artist_id = … AND day BETWEEN …` (cheap point/range — never scans the ledger) |
| "Explain my statement" (Bedrock) | scoped summary rows → Claude |

---

## Why this split

- **Conditional, single-digit-ms balance decrement** + **TTL firehose** + **Streams-as-trigger** → DynamoDB. (Justified by access pattern, not volume — at demo scale the write rate is trivial.)
- **ACID append-only ledger, relational catalog, scale-to-zero between billing runs** → Aurora DSQL.
