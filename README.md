# TollRoad

**The metered-billing DSP for music.** You pay for the minutes you actually listen — artists get paid for the minutes you actually played.

---

## The problem

Streaming runs on **all-you-can-eat subscriptions** ($11.99/mo) and **pro-rata royalty pools**: the platform throws every subscriber's fee into one bucket and splits it by *share of total platform streams*. A song you loved and a song you skipped are paid the same way, and your $11.99 mostly funds whoever is trending — not who you listened to.

Two things are broken:

1. **Listeners overpay.** The average listener plays ~3,278 songs/year ≈ **9,800 minutes**. At a fair per-minute rate that's about **$8/mo** — less than the $11.99 flat fee. Light listeners subsidize heavy ones.
2. **Artists are paid by a pool, not by you.** Per-stream payout is an opaque, ever-shrinking fraction of a shared pot. There is no clean line from *"I listened to this track for 4 minutes"* to *"this artist earned for those 4 minutes."*

## What TollRoad is

TollRoad meters playback the way a utility meters electricity. **Every minute streamed is a metered billing event** attributed to one listener and one rightsholder. Listeners keep a prepaid balance and watch a live per-minute meter as they play; artists and labels see exactly which minutes earned what, in a royalty ledger that is the system of record — not a pooled estimate.

- **Listeners** top up a balance, stream anything, and pay only for minutes played. A live meter shows the cost ticking up; stop listening, stop paying.
- **Artists** set a per-minute rate and earn on actual consumption, settled to an auditable royalty statement.
- **Labels / catalogs** get the same engine as infrastructure: drop in a catalog, and TollRoad becomes their **per-rightsholder royalty-metering and billing layer** — *"Stripe for music royalties."*

The metering and the ledger are the product. Playback is just what generates the meter readings.

## Why now

Usage-based billing won every other software category (cloud, APIs, AI tokens). Music is the last big consumption medium still sold as a flat all-you-can-eat plan with pooled payouts. The infrastructure to meter consumption at scale and reconcile it into a billing system-of-record is now a solved pattern — TollRoad applies it to streaming.

---

## Architecture

```
  Listener app  (Vercel / v0 — HLS player + live per-minute meter · artist/label dashboard)
       │                                              │
       │ every ~45s:  POST /api/renew                 │ GET audio segments
       │ (the meter tick — forge-proof)               │ (CloudFront signed cookie)
       ▼                                              ▼
  ┌──────────────────────────┐               ┌────────────────────────┐
  │        /api/renew        │               │   CloudFront  (OAC)    │
  │ 1. conditional decrement │               │   signed-cookie gate   │
  │    balance >= cost       │               └───────────┬────────────┘
  │ 2. write metered event   │                 origin pull, transparent
  │ 3. issue fresh 60s cookie│                           ▼ SSE-KMS decrypt
  └────────────┬─────────────┘               ┌────────────────────────┐
               ▼                              │     S3  (SSE-KMS)      │◄── AWS KMS
  ┌──────────────────────────┐               └────────────────────────┘   one CMK;
  │        DynamoDB          │                                             OAC holds
  │  • balance item          │   hard stop-at-zero on the hot path         kms:Decrypt
  │    (conditional write)   │
  │  • metered events (TTL)  │
  │  • Streams ──────────────┼──►  Lambda rollup  ──►  Aurora DSQL  (scale-to-zero OLTP)
  └──────────────────────────┘     idempotent,          • catalog · accounts
                                    dedup by unique key, • append-only royalty ledger (SoR)
                                    ≤3k rows / txn       • per-artist/day summaries (BI)
                                                              │            │
                                       dashboard reads (cheap point/range) │
                                       Bedrock (Claude) ── "explain my royalty statement"
                                       Stripe ── balance top-up + artist payout statement
```

- **Amazon DynamoDB — the metering hot path.** Holds the listener's **real-time balance** (a conditional `UpdateItem` that decrements only while `balance >= cost`, so a listener can never stream past zero) and the **raw metered-event firehose** (TTL keeps the hot table small). **Streams** trigger the rollup. Chosen for single-digit-ms conditional writes, TTL, and Streams — not for raw volume.
- **Amazon Aurora DSQL — the system of record.** Serverless, **scale-to-zero**, Postgres-compatible OLTP store holding the **catalog**, the **append-only royalty ledger** (one immutable credit row per rolled-up minute), and **precomputed per-artist/day summaries** for the dashboard. Kept *out* of the per-minute hot loop so it can actually scale to zero between billing runs.
- **S3 + CloudFront + AWS KMS — delivery & stream keys.** Audio is encrypted at rest with **SSE-KMS** (one CMK). CloudFront uses **Origin Access Control (OAC)** — which, unlike legacy OAI, supports SSE-KMS — and S3 ↔ KMS decryption is **transparent** (no per-play KMS call in our code, CDN stays hot). Access is gated by **short-TTL signed cookies** that `/api/renew` issues *only after the meter authorizes*. The meter controls access; KMS protects the bytes.
- **AWS Lambda — the rollup.** Consumes DynamoDB Streams (**at-least-once**, so duplicates are expected) and writes the ledger **idempotently** (UNIQUE idempotency key + `ON CONFLICT DO NOTHING`), batched within DSQL's 3,000-row / 10 MiB / 5-min transaction limits, and maintains the summary tables.
- **Amazon Bedrock (Claude)** — natural-language access to your own numbers (*"explain this month's statement," "which track earned most per minute?"*). Catalog + ledger are bounded, so a single model call answers over a scoped SQL result — no vector database.
- **Stripe (usage-based)** — listener balance top-ups and artist payout statements, fed by the DSQL ledger.

## How a stream is metered (server-authoritative)

The meter cannot be forged or bypassed, because **playback depends on the meter**, not the other way around:

1. Listener hits play → app requests a session; `/api/renew` checks balance, issues a **60-second** CloudFront signed cookie, decrements the hot balance, and writes a metered event.
2. The HLS player streams segments from CloudFront using that cookie.
3. Every ~45s the player must call `/api/renew` again to get a fresh cookie. Each renewal is a **balance-checked, recorded, forge-proof meter tick**.
4. Stop paying (balance hits zero) or stop renewing → the current cookie expires → **playback stops**. You can't listen free (no cookie, no segments) and you can't wash-stream to inflate earnings (no renewal, no recorded minute).

## Core access patterns

| Pattern | Design |
|---|---|
| Authorize / continue a stream | `/api/renew`: conditional `UpdateItem ADD spent … ConditionExpression balance >= cost` (DynamoDB), then issue a short-TTL CloudFront signed cookie |
| Record a metered minute | DynamoDB metered event `PK=USER#<id>`, `SK=TS#<minute>#<track>`, generous TTL (only after it's durable in the ledger) |
| Roll up to the ledger | Streams → Lambda → idempotent insert into DSQL ledger, dedup on `UNIQUE(user,track,minute)`, chunked ≤3,000 rows/txn |
| Listener balance / spend | DynamoDB balance item (hot) ; DSQL ledger (durable reconciliation) |
| Artist royalty statement | Read precomputed DSQL summary rows (no heavy scan) |
| Browse catalog | SQL on DSQL `tracks` joined to `artists` (FKs enforced in app — DSQL has none) |
| Stream audio | Meter issues signed cookie → CloudFront (OAC) → S3 (SSE-KMS, transparent decrypt) |
| Ask your earnings | Scoped SQL summary → Claude on Bedrock |

## Designing around Aurora DSQL

DSQL is not vanilla Postgres, and the design leans into its grain rather than fighting it:

- **No foreign keys, triggers, or PL/pgSQL** → referential integrity and "trigger" logic live in the app / the Streams→Lambda pipeline.
- **Optimistic concurrency (no row locks)** → a mutable "running total" row would throw `40001` conflicts under load. The ledger is **append-only**; balances are `SUM`/summary, which is both OCC-friendly and the correct accounting pattern.
- **OLTP, not analytics** (128 MiB/query) → BI runs off **precomputed summaries**, never large `GROUP BY` over the raw ledger.
- **Per-transaction caps** (3,000 rows / 10 MiB / 5 min) → rollups write in bounded batches.
- **IAM-token auth, client-side pooling only** (no RDS Proxy / PgBouncer) → serverless functions generate the token at cold start and reuse a module-scoped `pg` client across warm invocations.

## Region

All resources run in **`us-east-1`** (DynamoDB, Aurora DSQL, Lambda, S3, KMS, Bedrock; CloudFront is global) — co-located, and the region where Claude on Bedrock is available on-demand.

---

## Pricing model

- **Listeners** pay **per minute played** — fund a balance, spend it down as you listen. Typical listener ≈ $8/mo at fair per-minute rates, below the $11.99 flat plan.
- **Artists / labels** set a per-minute rate and earn on metered consumption, reconciled to an auditable statement.
- **TollRoad** takes a thin platform margin on metered minutes — revenue scales directly with consumption, mirroring the underlying metering infrastructure's own economics.

## Stack

Next.js (v0) · Vercel · Amazon DynamoDB · Amazon Aurora DSQL · AWS Lambda · Amazon S3 · CloudFront (OAC) · AWS KMS · Amazon Bedrock (Claude) · Stripe (usage-based billing)

## Status

🚧 In active development for the [H0: Hack the Zero Stack](https://h01.devpost.com/) hackathon. Crypto-free AWS rebuild of an earlier pay-per-minute streaming prototype — the metering IP, re-grounded on AWS databases.
