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
| **Metered minute** | `USER#<userId>` | `EVT#<minuteEpoch>#<trackId>` | `type="METER"`, `userId`, `trackId`, `artistId`, `minuteEpoch`, `amountCents`, `idempotencyKey`, `ttl`, `GSI1PK=ARTIST#<artistId>`, `GSI1SK=EVT#<minuteEpoch>` | Written by `/api/renew`. `type="METER"` is the stream filter that drives the rollup. `ttl` is **generous** (e.g. 30 days) — never expire a minute before it's durable in the ledger. |
| **Play session** *(optional)* | `USER#<userId>` | `SESS#<trackId>` | `cookieExpiresAt`, `lastRenewAt`, `ttl` | Lets the server reason about an active session; not required for billing. |

### Hot-path write (`/api/renew`, every ~45s)

```
UpdateItem  PK=USER#<u> SK=BAL
  SET balanceCents = balanceCents - :cost, updatedAt = :now
  ConditionExpression: balanceCents >= :cost      # stop-at-zero
PutItem     PK=USER#<u> SK=EVT#<min>#<t>          # type=METER → Streams → rollup
  idempotencyKey = '<u>#<t>#<min>'
→ issue a fresh short-TTL CloudFront signed cookie
```

`idempotencyKey = user#track#minute` is the dedup anchor that makes the
downstream ledger exactly-once.

---

## Aurora DSQL — system-of-record

PostgreSQL-16 wire-compatible, **OLTP**, scale-to-zero. Designed around DSQL's
grain: **no foreign keys / triggers / PL-pgSQL** (integrity in the app + the
rollup), secondary indexes via `CREATE INDEX ASYNC`, **append-only** ledger to
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
