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
                  ┌────────────────────────────┐
                  │    Vercel / v0 (Next.js)    │  player + live per-minute meter
                  │                            │  artist / label royalty dashboard
                  └───┬───────────────────┬────┘
   play heartbeat     │                   │  catalog + dashboard reads (SQL)
   (every minute)     │                   │
                      ▼                   ▼
            ┌────────────────────┐   ┌──────────────────────────┐
            │     DynamoDB       │   │       Aurora DSQL         │
            │  hot metering path │   │  scale-to-zero relational │
            │                    │   │  system of record         │
            │ PK = USER#<id>     │   │                           │
            │ SK = TS#<minute>   │   │  accounts · artists ·     │
            │ TTL on raw events  │   │  tracks · catalog ·       │
            │ atomic per-track   │   │  royalty ledger ·         │
            │   minute counters  │   │  invoices · balances · BI │
            └─────────┬──────────┘   └────────────▲──────────────┘
                      │ Streams → Lambda rollup    │
                      └────────────────────────────┘
                      ▲                            │
   audio bytes        │                            ▼
  ┌────────────────┐  │              ┌──────────────────────────────┐
  │ S3 + CloudFront│──┘              │  Stripe (usage-based billing) │
  │ SSE-KMS audio  │                 │  top-up + artist payout stmt  │
  │ presigned, CDN │                 └──────────────────────────────┘
  └───────┬────────┘
          │ unwrap data key (only after the meter authorizes)
          ▼
  ┌────────────────┐
  │    AWS KMS     │  envelope encryption — per-track data keys,
  │  stream keys   │  decrypt gated by balance + play session
  └────────────────┘
                      ┌──────────────────────────────┐
   ask your earnings  │   Amazon Bedrock (Claude)     │
   ───────────────────►│  "explain my royalty stmt" / │
                      │   natural-language catalog Q&A │
                      └──────────────────────────────┘
```

- **Amazon DynamoDB** — the high-write metering hot path. Every minute of playback is a heartbeat: an atomic `ADD` to a per-listener, per-track minute counter, with a TTL on the raw events so the hot table stays small. Streams drive the rollup into the billing system-of-record. This is the meter.
- **Amazon Aurora DSQL** — serverless, **scale-to-zero**, Postgres-compatible relational store doing triple duty: the **catalog** (artists, tracks, rates), the **royalty ledger** (who earned what, per minute, per rightsholder — the billing system-of-record), and the **label BI** dashboard. Idle between billing runs costs nothing.
- **S3 + CloudFront** — all audio, encrypted at rest with **SSE-KMS**. Presigned uploads, signed CDN delivery; egress is the dominant scaling lever and sits inside CloudFront's always-free tier at demo scale.
- **AWS KMS** — manages the streaming keys. Each track's audio is sealed under a KMS-wrapped data key (envelope encryption); the decrypt path is **gated by the meter** — the backend only requests a `Decrypt`/unwraps the data key after the listener's balance and play session are validated. KMS key policy + grants ensure only the streaming function can unwrap, and rotation is managed by KMS, not by hand.
- **Amazon Bedrock (Claude)** — natural-language access to your own numbers: *"explain this month's royalty statement,"* *"which track earned the most per minute?"* Catalog and ledger are bounded, so no vector database is needed — a single model call answers over a scoped SQL result.
- **Stripe (usage-based)** — listener balance top-ups and artist payout statements, fed by the DSQL ledger.

### Core access patterns

| Pattern | Design |
|---|---|
| Heartbeat a minute played | DynamoDB `UpdateItem ADD minutes 1` on `PK=USER#<id>`, `SK=TRACK#<id>` |
| Raw event audit trail | `PK=USER#<id>`, `SK=TS#<minute>#<track>`, with 24–72h TTL |
| Roll up to the ledger | Streams → Lambda → atomic insert/credit into Aurora DSQL |
| Listener balance / spend | SQL on DSQL `accounts` / `ledger` |
| Artist royalty statement | SQL aggregate on DSQL `ledger` by rightsholder + period |
| Browse catalog | SQL on DSQL `tracks` joined to `artists` |
| Stream audio | Meter authorizes → KMS unwraps the track data key → decrypt → presigned S3 GET via CloudFront |
| Ask your earnings | Scoped SQL result → Claude on Bedrock |

### Region

All resources run in **`us-east-1`** (DynamoDB, Aurora DSQL, Lambda, S3, Bedrock; CloudFront is global) — co-located, and the region where Claude on Bedrock is available on-demand.

---

## Pricing model

- **Listeners** pay **per minute played** — fund a balance, spend it down as you listen. Typical listener ≈ $8/mo at fair per-minute rates, below the $11.99 flat plan.
- **Artists / labels** set a per-minute rate and earn on metered consumption, reconciled to an auditable statement.
- **TollRoad** takes a thin platform margin on metered minutes — revenue scales directly with consumption, mirroring the underlying metering infrastructure's own economics.

## Stack

Next.js (v0) · Vercel · Amazon DynamoDB · Amazon Aurora DSQL · AWS Lambda · Amazon S3 · CloudFront · AWS KMS · Amazon Bedrock (Claude) · Stripe (usage-based billing)

## Status

🚧 In active development for the [H0: Hack the Zero Stack](https://h01.devpost.com/) hackathon. Crypto-free AWS rebuild of an earlier pay-per-minute streaming prototype — the metering IP, re-grounded on AWS databases.
