# TollRoad

**The metered-billing DSP for music.** You pay for the minutes you actually listen — artists get paid for the minutes you actually played.

> **AWS Databases used:** **Amazon DynamoDB** (the command / write hot path) and
> **Amazon Aurora DSQL** (the query / read model + system of record), wired together
> as full **polyglot CQRS** via DynamoDB Streams. Front end on **Vercel / v0**.

---

## The problem

Streaming runs on **all-you-can-eat subscriptions** ($11.99/mo) and **pro-rata royalty pools**: the platform throws every subscriber's fee into one bucket and splits it by *share of total platform streams*. A song you loved and a song you skipped are paid the same way, and your $11.99 mostly funds whoever is trending — not who you listened to.

Two things are broken:

1. **Listeners overpay.** The average listener plays ~3,278 songs/year ≈ **9,800 minutes**. At a fair per-minute rate that's about **$8/mo** — less than the $11.99 flat fee. Light listeners subsidize heavy ones.
2. **Artists are paid by a pool, not by you.** Per-stream payout is an opaque, ever-shrinking fraction of a shared pot. There is no clean line from *"I listened to this track for 4 minutes"* to *"this artist earned for those 4 minutes."*

## What TollRoad is

TollRoad meters playback the way a utility meters electricity. **Every minute streamed is a metered billing event** attributed to one listener and one rightsholder. Listeners keep a prepaid balance and watch a live per-minute meter as they play; artists and labels see exactly which minutes earned what, in a royalty ledger that is the system of record — not a pooled estimate.

- **Listeners** top up a balance, stream anything, and pay only for minutes played. A live meter shows the cost ticking up; stop listening, stop paying.
- **Artists** set their own per-minute rate per track — anywhere from **free** to $1.00/min — and earn on actual consumption, settled to an auditable royalty statement and **paid out via Stripe Connect**.
- **Labels / catalogs** get the same engine as infrastructure: drop in a catalog, and TollRoad becomes their **per-rightsholder royalty-metering and billing layer** — *"Stripe for music royalties."*
- **AI agents** are first-class clients: an MCP server turns the catalog into a programmatic **Vibe DJ** that discovers, pays (x402), and streams on your behalf.

The metering and the ledger are the product. Playback is just what generates the meter readings.

## Why now

Usage-based billing won every other software category (cloud, APIs, AI tokens). Music is the last big consumption medium still sold as a flat all-you-can-eat plan with pooled payouts. The infrastructure to meter consumption at scale and reconcile it into a billing system-of-record is now a solved pattern — TollRoad applies it to streaming.

---

## What's in the product

The metering core is wrapped in a full listener + artist product. Everything below is shipped and wired end-to-end (backend route ⋈ frontend page).

### For listeners
- **Stream & meter** — a global player with a live per-minute taximeter, repeat (off → all → one), and a hard stop-at-zero balance gate.
- **Wallet** — prepaid top-ups via **Stripe** ($10 packs), a $3 **onboarding gift**, and a real-time balance.
- **Library** — likes, playlists (create / reorder / make public), recently played. **Liking a track costs one minute (1¢)** — a real-money signal that funds the artist, debited atomically with the like (unliking is free, no refund).
- **Discovery** — browse, search, and per-artist pages.
- **Superfan Bonds** — every metered minute becomes a visible, ranked, leveling relationship with a specific artist. Public profile is a *wall of bonds*; each artist has a **fan leaderboard** ranked by minutes given. Because minutes are real money, standing can't be farmed.
- **Vibe Pad** — a valence × energy mood-tagging mini-game. Drag a puck while a song plays to record a **mood trace**; earn **free listening-minutes** weighted by agreement with the crowd **consensus** (computed in distributed SQL). The game's output *is* an AI-tagging training set.
- **Public share pages** — shareable artist (`/a/<slug>`) and public-profile (`/s/<slug>`, `/u/<handle>`) pages with OG images.

### For artists
- **Mobile-friendly dashboard** — earnings summary off precomputed DSQL rollups (never a ledger scan).
- **Song CRUD** — create tracks, upload audio (presigned → SSE-KMS S3), edit, soft-delete (`tracks.is_active`).
- **Variable rates** — set a per-track rate from **free (0)** up to **$1.00/min** at **0.1¢ precision** — the value the meter already honors.
- **Profiles & media** — bio/genre/location/links, avatar + cover uploads (presign → commit).
- **Stripe Connect payouts** — onboard an Express account, check status, and withdraw earned balance; ledger math reconciled from the DSQL royalty ledger.

### For agents & developers
- **Vector discovery** — `/discover` embeds a free-text vibe with **Amazon Bedrock (Titan v2)** and runs a cosine search over per-track vectors stored in **DynamoDB** — DynamoDB doubling as the vector store. Stateful DJ sessions (`/sessions`) pick no-repeat tracks and accept steering signals.
- **MCP server** (`mcp/`) — `search_music`, `start_session`, `next_track`, `get_stream`, `get_balance`: an agent runs a DJ session and pays-per-minute over the x402 loop.
- **`/connect`** and **`/developers`** marketing pages document the MCP setup and the public `/v1` API.

---

## Architecture — polyglot CQRS

The money path is split into a **command side** (high-velocity writes on DynamoDB) and a
**query side** (relational read models + system-of-record on Aurora DSQL), joined by a
projector. Each database is used for the grain it is best at.

```
  Listener app (Vercel / v0 — player + live per-minute meter · artist dashboard)
  AI agents / 3rd-party clients  (x402:  request → 402 → pay → retry)
        │                                                  │
        │ POST /v1/charge  — the meter tick                │ GET audio bytes
        │ (~once per minute played)                        │ (short-lived signed URL)
        ▼                                                  ▼
  ┌────────────────────────────────┐              ┌────────────────────────┐
  │  API Gateway (REST, stage /v1) │              │   CloudFront  (OAC)    │
  │  + Lambda   ── command path    │              │   signed-URL gate      │
  └───────────────┬────────────────┘              └───────────┬────────────┘
   COMMAND (writes)│                                 transparent▼ SSE-KMS decrypt
  ┌───────────────▼────────────────┐              ┌────────────────────────┐
  │      Amazon DynamoDB           │              │   S3 (SSE-KMS) ◄── KMS │
  │  • balance item                │              └────────────────────────┘
  │    (conditional debit:         │
  │     ADD bal, cond. bal ≥ cost) │   one debit + one event per metered minute,
  │  • METER / TOPUP events        │   atomic via TransactWriteItems
  │  • Streams ────────────────────┼──►  Projector Lambda  ──►  Amazon Aurora DSQL
  └────────────────────────────────┘    sole DSQL writer ·       QUERY (reads / SoR)
                                         idempotent ·             • catalog · accounts · library
                                         OCC-safe (40001 retry)   • royalty_ledger (append-only SoR)
                                                                  • per-artist/day summaries (BI)
                                                                  • superfan bonds (derived) · mood
                                                                  • reconciliation balance
                                                                        │
                                       dashboard / history reads (cheap point + range)
                                       Stripe ── top-up → DynamoDB balance, reconciled into DSQL
```

- **Amazon DynamoDB — the command / hot path.** Holds the listener's **authoritative real-time balance** (a conditional `UpdateItem` that debits only while `balanceMillicents ≥ cost`, so a listener can never stream past zero) and the **METER / TOPUP event firehose** (TTL keeps the hot table small). A charge is a single `TransactWriteItems` — the conditional debit plus a guarded event `Put` — so one stream record fires per unique metered minute. Chosen for single-digit-ms conditional writes, no connection model, and horizontal scale: the only one of the three AWS databases built for ~16–23K writes/sec at a million concurrent streams.
- **Amazon Aurora DSQL — the query side / system of record.** Serverless, **scale-to-zero**, Postgres-compatible store holding the **catalog**, **accounts & artist profiles**, the **listener library** (likes / playlists / recents), the **append-only `royalty_ledger`** (one immutable credit row per metered minute), **precomputed per-artist/day summaries**, the **mood traces + crowd consensus**, and the **reconciliation balance**. Superfan bonds and leaderboards are **derived in-SQL** from the ledger — no separate store. Kept *out* of the per-minute hot loop so DSQL is free to scale to zero between projection runs and serve cheap relational reads.
- **AWS Lambda — the projector.** The **sole writer of the DSQL read models.** It consumes DynamoDB Streams (**at-least-once**, duplicates expected) and builds the ledger **idempotently** (`UNIQUE` idempotency key + `ON CONFLICT DO NOTHING`), the summaries, the top-up history, and the reconciliation balance, with OCC `40001` retries. **This fixes the old rollup bug by construction:** the synchronous charge used to write the DSQL ledger itself, front-running the rollup so the projector always hit `ON CONFLICT DO NOTHING` and summaries never updated. Now the command touches only DynamoDB and the projector owns DSQL — no race, no dropped summary.
- **S3 + CloudFront + AWS KMS — delivery & stream keys.** Audio is encrypted at rest with **SSE-KMS** (one CMK). CloudFront uses **Origin Access Control (OAC)** and S3 ↔ KMS decryption is **transparent** (no per-play KMS call, CDN stays hot). Access is gated by **short-TTL signed URLs** the API issues *only after the meter authorizes*. A second CloudFront distribution serves public artist images (avatars/covers). The meter controls access; KMS protects the bytes.
- **Stripe** — listener balance top-ups (credited to the DynamoDB balance, reconciled into DSQL) and **artist payouts via Stripe Connect (Express)** fed by the DSQL ledger.

> **Currency note:** all monetary values are stored as **millicents** (cents × 1000) so sub-cent
> per-minute rates are representable (a track can be priced at 0.5¢/min). Stripe stays in whole cents
> at the boundary; the sub-cent remainder lives in the artist balance.

## How a stream is metered (server-authoritative)

Playback depends on the meter, not the other way around:

1. Listener hits play → `POST /v1/charge` debits **one minute** from the DynamoDB balance (conditional — it can never go below zero) and records a METER event.
2. `GET /v1/stream/{trackId}` returns a **short-lived (150 s) CloudFront signed URL** — but only when a recent paid minute exists (`hasRecentMeter` on DynamoDB). No paid minute → **HTTP 402** with x402 payment terms.
3. About **once per minute of playback** the client calls `/v1/charge` again. Each call is a balance-checked, recorded meter tick.
4. Balance hits zero → the next `/charge` returns **402** → the client stops and prompts a top-up; the in-flight signed URL expires within 150 s. No pay → no recorded minute → no new grant. You can't listen free, and you can't wash-stream to inflate earnings.

> **Free tier:** a track priced at `0` meters at zero — same auth/stream path, no special branch.
>
> **Hardening roadmap (designed, see [`docs/decisions/`](docs/decisions)):** a server-authoritative
> **signed-heartbeat** meter — the server issues a signed token chain and computes elapsed time
> itself — closes client-side forgery and self-stream inflation entirely. Tracked as a fast-follow.

## Core access patterns

| Pattern | Design |
|---|---|
| Pay a metered minute | `POST /v1/charge`: DynamoDB `TransactWriteItems` — conditional `ADD balanceMillicents` (cond. `balanceMillicents ≥ cost`) + guarded METER `Put` |
| Authorize / continue a stream | `GET /v1/stream/{id}`: `hasRecentMeter` (DynamoDB) → short-TTL CloudFront signed URL; else **402** (x402) |
| Project to the read model | DynamoDB Streams → projector Lambda (sole DSQL writer) → idempotent `royalty_ledger` insert, dedup on `UNIQUE(idempotency_key)`, summaries + reconciliation |
| Listener balance | DynamoDB balance item (authoritative, real-time); DSQL reconciliation balance (durable) |
| Like a track | `POST /v1/library/likes`: charges one minute + inserts the `likes` row in one transaction (unlike is free) |
| Artist royalty statement | Read precomputed DSQL `artist_daily_summary` rows (no heavy scan) |
| Set a per-track rate | `POST /v1/artist/track/rate`: validates `0 … $1.00/min` at 0.1¢ steps, writes `tracks.price_per_minute_millicents` |
| Superfan bond / leaderboard | Derived in-SQL from `royalty_ledger` (per-fan minute counts, ranked) — no extra table |
| Mood trace + reward | `POST /v1/mood/trace` stores the trace; consensus + agreement computed in DSQL; reward credited as free minutes via the wallet path |
| Browse catalog | SQL on DSQL `tracks` ⋈ `artists` (FKs enforced in app — DSQL has none) |
| Artist payout | `POST /v1/artist/payouts/withdraw`: Stripe Connect transfer, recorded in `payout_transfers` |
| Top up | Stripe → credit DynamoDB balance + TOPUP event → projector reconciles into DSQL `wallet_topups` |

## Designing around Aurora DSQL

DSQL is not vanilla Postgres; the design leans into its grain:

- **No foreign keys, triggers, or PL/pgSQL** → referential integrity and "trigger" logic live in the app / the Streams → projector pipeline.
- **Optimistic concurrency (no row locks)** → a mutable "running total" row would throw `40001` under load. The ledger is **append-only**; balances are `SUM`/summary — OCC-friendly and the correct accounting pattern.
- **OLTP, not analytics** (128 MiB/query) → BI runs off **precomputed summaries**, never a large `GROUP BY` over the raw ledger. Mood **consensus** is computed with vanilla window functions / `generate_series` — no timeseries DB, no extensions.
- **Per-transaction caps** (3,000 rows / 10 MiB / 5 min) → the projector writes in bounded batches.
- **IAM-token auth, client-side pooling only** → functions mint the token at cold start and reuse a module-scoped `pg` client across warm invocations.

All resources run in **`us-east-1`** (DynamoDB, Aurora DSQL, Lambda, S3, KMS; CloudFront is global).

---

## API-first — and x402

TollRoad is a **backend API with clients**, not a monolith. A standalone service
(**Amazon API Gateway** REST + Lambda — see [`backend/`](backend/)) is the system of
record; the Next.js app, third-party integrations, and AI agents are all just consumers
of the same `/v1` contract ([`backend/openapi.yaml`](backend/openapi.yaml)).

Streaming is gated by an **x402-style protocol** — `request → 402 Payment Required → pay →
retry` — but **crypto-free**: settlement is the prepaid wallet (DynamoDB balance, reconciled
in Aurora DSQL), not a chain. A paid request returns a short-lived signed URL; the bytes never
flow through the API. The public API carries **usage-plan API keys** so an agent can
stream-and-pay programmatically — see [`scripts/agent-demo.mjs`](scripts/agent-demo.mjs) and
the [`mcp/`](mcp/) Vibe DJ server.

## Pricing model

- **Listeners** pay **per minute played** — fund a balance, spend it down. Typical listener ≈ $8/mo, below the $11.99 flat plan.
- **Artists / labels** set a per-track rate (**free → $1.00/min**, 0.1¢ precision) and earn on metered consumption, reconciled to an auditable statement and paid out via Stripe Connect.
- **TollRoad** takes a thin, flat platform margin (10%) on metered minutes — revenue scales directly with consumption. Full unit economics in [`docs/cost/`](docs/cost).

---

## Repository layout

```
backend/      The /v1 API — system of record. One Lambda behind API Gateway (prod)
              or a local Node server (dev). Command path, x402, auth, library,
              artist dashboard, payouts, superfan, mood, and discovery live here.
infra/        AWS CDK — DynamoDB, Aurora DSQL, the projector Lambda, S3/CloudFront/KMS
              (audio + images), API Gateway + usage plans. Migrations under infra/scripts.
frontend/     Next.js (v0) listener app + artist/label dashboard, deployed on Vercel.
mcp/          MCP server — the Vibe DJ: agent tools over the x402 loop.
scripts/      agent-demo.mjs — the x402 loop walked by a programmatic client; catalog tooling.
docs/         Architecture is in this README; deeper references below.
```

## Documentation

- [`docs/data-model.md`](docs/data-model.md) — DynamoDB item shapes + the full DSQL DDL.
- [`docs/decisions/`](docs/decisions) — design specs & decision records (polyglot CQRS, variable rates, artist profiles).
- [`docs/superpowers/specs/`](docs/superpowers/specs) — feature design specs (superfan bond, share pages, vibe DJ, mood pad, payouts + song CRUD, mobile dashboard).
- [`docs/cost/`](docs/cost) — unit economics, the 10k-user workload model, and cost visuals.
- [`backend/README.md`](backend/README.md) · [`infra/README.md`](infra/README.md) · [`frontend/README.md`](frontend/README.md) · [`mcp/README.md`](mcp/README.md) — per-package guides.

## Quickstart (local)

```bash
# 1. Backend API (system of record)
cd backend && npm install
export TOLLROAD_SESSION_SECRET="<32+ random chars>"
export TOLLROAD_OTP_PEPPER="<32+ random chars>"
export TOLLROAD_DSQL_ENDPOINT="<cluster>.dsql.us-east-1.on.aws"   # + AWS creds
npm run dev            # → http://localhost:8787/v1   (npm test · npm run typecheck)

# 2. Apply the schema (DSQL DDL is millicents-native; run the mood migration too)
node ../infra/scripts/migrate-dsql.mjs
node scripts/migrate-mood.mjs

# 3. Walk the x402 loop as a programmatic client
API_BASE=http://localhost:8787/v1 TOLLROAD_TOKEN=<jwt> node ../scripts/agent-demo.mjs
```

Point the front end at the API with `TOLLROAD_API_BASE=http://localhost:8787/v1`.
Full env reference in [`backend/.env.example`](backend/.env.example).

## Stack

Next.js (v0) · Vercel · **Amazon API Gateway** · **Amazon DynamoDB** · **Amazon Aurora DSQL** · AWS Lambda · Amazon S3 · CloudFront (OAC) · AWS KMS · Stripe (usage-based billing + Connect payouts) · MCP (Vibe DJ) · x402-style metered API

## Status

🚧 Built for the [H0: Hack the Zero Stack](https://h01.devpost.com/) hackathon (Track 3 — million-scale).
A crypto-free AWS rebuild of a pay-per-minute streaming prototype: the metering IP, re-grounded on
**DynamoDB + Aurora DSQL** as a polyglot-CQRS system designed to scale to a million concurrent streams —
now wrapped in a full listener + artist product (library, superfan bonds, mood game, variable rates,
Stripe Connect payouts) and an agent-facing Vibe DJ.
