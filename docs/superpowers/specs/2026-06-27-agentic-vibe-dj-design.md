# TollRoad Agentic — Vibe DJ Platform Design

**Date:** 2026-06-27
**Status:** Approved for implementation
**Author:** Solutions architecture pass with Anthony

---

## 1. Vision

Let **any app or AI agent** score its experience with **metered, direct-licensed music** by describing *intent* — "tense final boss, 140 BPM synthwave" or "calm Sunday brunch, jazzy, low energy" — and get back a live, per-minute-billed stream.

Two distribution surfaces, one backend:

- **MCP server** — agent-native. An AI agent (in a game engine, an experience platform, a Claude session) calls tools to discover a vibe, start a session, and stream. The agent is the customer making autonomous discovery + spend decisions.
- **Client SDK** — developer-native. A studio or app drops a TollRoad player onto an audio source, points it at a vibe query or track, and metered streaming "just works."

**Product framing:** *Epidemic Sound / Artlist, rebuilt for the agentic era.* The moat is not the MCP server or the vector search (both are replicable) — it is the combination of **direct-licensed creator supply paid per second of actual use**, **agent-native distribution**, and **metering/settlement rails that already run in production**. The vibe-DJ is the wedge and the killer demo.

**Non-goals (explicit):**
- No AI music *generation*. The catalog is real, direct-licensed tracks. (Generative scoring is a possible future tier, out of scope here.)
- No on-chain / USDC settlement in this build. The x402 *metered-API* shape is reused; settlement stays fiat/prepaid. (USDC is a pluggable funding adapter later.)
- No PRO / major-label blanket licensing. Supply is the existing artist-upload, per-minute-royalty catalog.

---

## 2. What already exists (build on, do not rebuild)

Confirmed from the codebase:

| Capability | Where | Reuse |
|---|---|---|
| Per-minute meter (millicents, idempotent) | `backend/src/handlers/charge.ts`, `domain/meter.ts`, `domain/wallet-store.ts` | Core billing primitive — keep as-is |
| Wallet / balance (DynamoDB authoritative) | `domain/wallet-store.ts` (`PK=USER#<id>`, `SK=BAL`) | Extend billable principal to tenant |
| x402 402-gate + payment terms | `lib/x402.ts`, `handlers/stream.ts`, `handlers/charge.ts` | Reuse the 402 → pay → grant loop |
| Signed CloudFront streaming (150s TTL) + local proxy | `domain/streaming.ts`, `handlers/stream.ts` | Reuse as metered-window delivery |
| CQRS: DynamoDB Streams → projector → Aurora DSQL ledger | `infra` + projector | **Add the vector index as a new read projection** |
| Aurora DSQL schema + additive migrations | `infra/scripts/migrate-dsql.mjs` | Add catalog enrichment + tenant tables |
| API Gateway + usage-plan API keys + JWT authorizer | `backend/src/router.ts`, `handlers/authorizer.ts`, `infra/lib/tollroad-stack.ts` | Extend to per-tenant keys/scopes |
| Programmatic agent loop reference | `scripts/agent-demo.mjs` | Template for the MCP server's internals |
| Next.js frontend on Vercel (proxy to backend) | `frontend/app/api/v1/[...path]/route.ts` | Extend with tenant dashboard + demo |

**Implication:** the only genuinely net-new subsystems are (a) the **discovery brain** (catalog enrichment + vector search + DJ session logic), (b) the **tenant/identity plane**, and (c) the **MCP server + SDK packaging**. Metering, streaming, wallet, royalty ledger, and the CQRS backbone are reused unchanged in shape.

---

## 3. Architecture — six units

Each unit has one job, a defined interface, and isolated internals.

### 3.1 Tenant & Identity Plane

**Job:** make "any app" a first-class billable principal.

- New principal: `TENANT#<tenantId>` with optional sub-accounts (`TENANT#<id>#SUB#<subId>` — e.g. a game title, a venue location). The wallet/meter key generalizes from `USER#<id>` to any principal string; existing end-user wallets keep working.
- Credentials: per-tenant **publishable key** (safe in clients, scoped to discovery + session-start) and **secret key** (server-side, scoped to charge/usage/balance). Keys carry scopes; rotation supported.
- Plans & quota: free tier (quota-capped), pay-as-you-go (per-minute), committed/subscription tiers. Backed by API Gateway usage plans (already present) + a `tenants` / `tenant_keys` table in DSQL.
- Onboarding: self-serve signup → tenant + keys issued → Stripe billing setup → integrate. Reuses existing Stripe top-up plumbing; the billable wallet is the tenant's.

**Interface:** `POST /tenants`, `POST /tenants/{id}/keys`, key-auth middleware resolving `apiKey → tenant → scopes → wallet`.

**Depends on:** DSQL (tenant records), DynamoDB (tenant wallet), API Gateway (key enforcement), Stripe.

### 3.2 Discovery Brain (the hero)

**Job:** turn natural-language *intent* into ranked, licensed, streamable tracks — and sequence them as a reactive DJ.

- **Enrichment pipeline:** on track upload (S3 event → Lambda), derive structured metadata (mood, genre, BPM, musical key, energy, instrumentation, use-case tags) and a **text embedding** of that descriptor (Amazon Bedrock — Titan/Cohere embeddings). Idempotent, re-runnable.
- **Vector index as a CQRS read projection:** the same projector pattern that feeds the DSQL ledger feeds a **vector read-store** — committed to **Aurora PostgreSQL Serverless v2 + `pgvector`** (HNSW index), running **scale-to-zero** (min 0 ACU, auto-pause). The projector writes Bedrock Titan v2 embeddings (1024-dim) there on track upsert; discovery reads via `ORDER BY embedding <=> $query` with metadata filters. Keeps the index consistent with the existing event flow and meaningfully uses a *second* permitted AWS database (see §6).
- **Query path:** NL scene → embed → vector nearest-neighbour → metadata re-rank/filter (BPM range, energy, explicit-content, duration, licensing scope) → ranked candidates with scores + reasons.
- **DJ session layer:** stateful. Maintains an energy curve, no-repeat window, and transition timing; given a *signal* (game event, time of day, "raise the energy") it picks the *next* track and a transition. This is the differentiator over a static playlist — it reads the moment and reacts.

**Interface:** `POST /discover` (vibe → candidates), `POST /sessions` (start a DJ session for a context), `POST /sessions/{id}/next` (advance with a signal), each returning track refs + stream grants.

**Depends on:** Bedrock (embeddings), vector store, catalog in DSQL, streaming unit.

### 3.3 Metering & Billing

**Job:** charge the right principal per minute of actual playback, and pay artists per second of use.

- Keep the millicents per-minute DynamoDB meter, idempotency (`<principal>#<trackId>#<minuteEpoch>`), and CQRS unchanged. Billable principal is now the tenant/sub-account.
- One `MeterEvent` projects two ways: **tenant invoice** (usage → billing) and **artist payout** (usage → royalty ledger → Stripe Connect, already wired via `artists.stripe_account_id` / `payouts_enabled`).
- Funding adapter pattern: Stripe (fiat top-up / B2B invoicing) and prepaid wallet now; USDC/x402 later. Settlement rail is pluggable; downstream metering never changes.

**Interface:** `POST /charge` (existing), `GET /balance`, `GET /usage` (tenant-scoped reporting projection).

**Depends on:** DynamoDB (meter/wallet), DSQL (royalty ledger, reporting), Stripe Connect.

### 3.4 Delivery & Enforcement

**Job:** make playback impossible without continued payment, without putting billing logic in the media file.

- Billing lives in *delivery*, not the file: per-session signed, short-lived stream grants (existing 150s CloudFront signing). The SDK refreshes the grant and posts a per-minute charge as playback crosses each minute boundary; on a declined charge it mutes/stops. The bytes are worthless after the TTL without a paid renewal — enforcement by delivery, not trust.
- Tiers: signed-window delivery (default), DRM/license-server (enterprise, future) for studios demanding piracy protection.

**Interface:** `GET /stream/{trackId}` → 402 or signed grant (existing); SDK-managed renewal loop.

**Depends on:** S3 + CloudFront (OAC, SSE-KMS, signed URLs), KMS, metering unit.

### 3.5 Surfaces — MCP Server + Client SDKs

**Job:** plug-and-play. Both surfaces are thin authenticated clients of the same HTTP API.

- **MCP server** (Node, stdio + HTTP transports). Tools:
  - `search_music({ vibe, constraints })` → ranked candidates
  - `start_session({ context })` → session id + first track + stream grant
  - `next_track({ session, signal })` → next track + transition + grant
  - `get_stream({ track_id })` → metered stream URL
  - `get_usage()` / `get_balance()` → spend + remaining
  - Auth via tenant API key (env/config). Internals mirror `scripts/agent-demo.mjs`.
- **Client SDKs** (Web first; Unity/Unreal/native to follow). Wrap platform audio, handle key auth, signed-segment streaming, per-minute metering, and auto-stop on declined charge.
- **Tenant dashboard** (extend the Vercel Next.js app): keys, usage, billing, catalog browse, royalty reports, and a live demo console.

**Depends on:** all backend units via HTTP; no privileged access.

### 3.6 Data Plane (the polyglot flex — production == hackathon story)

Right database per job, unified by one event flow:

```
                       ┌─────────────────────────────────────────────┐
  Agent / SDK ──HTTP──▶│  API Gateway + Lambda (router, authorizer)   │
                       └───────┬───────────────────────┬─────────────┘
                               │ writes (hot)          │ reads
                               ▼                        ▼
                       ┌──────────────┐         ┌────────────────────┐
                       │  DynamoDB    │         │  Discovery query   │
                       │  meter/wallet│         │  (embed + vector)  │
                       │  session/idem│         └─────────┬──────────┘
                       └──────┬───────┘                   │
                              │ Streams                   │ projection
                              ▼                           ▼
                       ┌──────────────┐         ┌────────────────────┐
                       │  Projector   │────────▶│  Aurora PG SLSv2   │
                       │  (sole writer)│        │  pgvector (→0 ACU) │
                       └──────┬───────┘         └────────────────────┘
                              │
                              ▼
                       ┌──────────────────────────────┐
                       │  Aurora DSQL (relational SoR) │
                       │  tenants, catalog, royalty    │
                       │  ledger, usage, payouts       │
                       └──────────────────────────────┘

  Audio bytes: S3 (SSE-KMS) ──OAC──▶ CloudFront (signed, 150s) ──▶ client
```

- **DynamoDB** — hot command path: meter events, wallet balances, idempotency, DJ session state. Single-digit-ms, scales to millions of concurrent metered streams (the "million-scale" narrative).
- **Aurora DSQL** — relational system of record: tenants, catalog + enrichment, append-only royalty ledger, usage rollups, payouts. Distributed, serverless, active-active.
- **Aurora PostgreSQL Serverless v2 + pgvector** — semantic discovery read projection (HNSW ANN, Titan v2 1024-dim), **scale-to-zero** (min 0 ACU). A *permitted* hackathon database, used as a true CQRS read model fed by the projector; Lambda reads via the RDS Data API.
- **S3 + CloudFront** — encrypted, signed audio delivery; bytes never touch Lambda in prod.

---

## 4. End-to-end data flow (agent vibe → metered stream)

1. Agent calls `search_music({ vibe: "tense boss fight, 140bpm synthwave" })` on the MCP server with the tenant key.
2. MCP → `POST /discover`. Lambda embeds the vibe (Bedrock), vector-searches the index, metadata re-ranks, returns candidates.
3. Agent calls `start_session` / `get_stream`. Lambda returns either a **402** (pay first) or a **signed 150s grant**.
4. On 402, the SDK/MCP posts `POST /charge` → DynamoDB debits the **tenant** wallet for the minute (idempotent), emits a `MeterEvent`.
5. Projector consumes the Stream event → writes the royalty ledger row in DSQL (artist gets paid for the minute) and updates usage rollups.
6. SDK streams from the signed CloudFront URL; as playback crosses each minute it refreshes the grant + charges again. Declined charge → mute/stop.
7. `next_track({ signal })` repeats discovery within the session, reacting to the moment.

---

## 5. Error handling

- **Insufficient balance:** `/charge` returns the existing conditional-write failure → SDK stops playback, surfaces "top up" to the tenant. Idempotent retries are safe (same minuteEpoch = no double charge).
- **Embedding/vector failure:** discovery degrades to metadata/tag filtering (no hard dependency on Bedrock at request time — embeddings are precomputed for the catalog; only the *query* embed is live, and it falls back to keyword match).
- **Expired grant mid-stream:** SDK refresh loop renews before the 150s TTL; on failure it pauses and retries, then stops.
- **Key scope violations:** publishable key attempting a `charge` → 403 at the authorizer.
- **Projector lag:** discovery and metering never block on DSQL projection; reads that need the ledger tolerate eventual consistency (existing pattern).

---

## 6. Open technical decision: vector store

Aurora DSQL is Postgres-*compatible* but supports only a subset of extensions; **`pgvector` availability on DSQL is unverified** and must be checked before committing. Options, with the AWS-database story each tells:

| Option | Pro | Con |
|---|---|---|
| **App-side cosine over vectors in DSQL/DynamoDB** | Zero new infra; fine at launch catalog scale; demos identically | Not sublinear; re-architect at large catalog |
| **Aurora PostgreSQL + pgvector** (separate read-store fed by projector) | Mature, fits CQRS read-model pattern; a *permitted* hackathon DB | New cluster to operate |
| **OpenSearch Serverless (vector)** | Scales, managed, strong semantic story | Cost; another service |
| **S3 Vectors** | Cheap, novel, fresh AWS angle | Newest/least proven |

**Decision (committed): Aurora PostgreSQL Serverless v2 + `pgvector`, scale-to-zero.** Real pgvector, running, serverless to ~$0 idle:

- **Serverless + scale-to-zero:** capacity range **min 0 ACU** → max N. After an inactivity window the cluster **auto-pauses to 0 ACU** (storage-only cost) and resumes on the next connection. Honest caveat: the first query after a pause pays a **resume latency (~10–15s)** — mitigate with a low-frequency warm-ping or a 0.5-ACU floor where cold starts are unacceptable.
- **pgvector:** `CREATE EXTENSION vector;`, `track_vectors(track_id uuid pk, embedding vector(1024), bpm int, energy real, explicit bool, …)`, **HNSW** index for high-recall ANN. Embeddings from **Bedrock Titan Text Embeddings V2 @ 1024 dims**.
- **Lambda access:** the **RDS Data API** (HTTP, IAM-auth, no persistent connections) — the right fit for Lambda + scale-to-zero, since there is no connection pool to strand when the cluster pauses. RDS Proxy is the alternative when warm latency matters more than connection-free simplicity.
- **Why this, not DSQL:** Aurora DSQL does not expose arbitrary extensions like pgvector; Aurora PostgreSQL does. Running both is deliberate — the platform uses **three** permitted AWS databases, each for the job it is best at: DynamoDB (hot meter), DSQL (relational SoR), Aurora PG (vector read-model).

OpenSearch Serverless and S3 Vectors remain documented alternates for very large catalogs.

---

## 7. Testing

- **Meter idempotency:** replay same `<tenant>#<track>#<minuteEpoch>` → single debit (extend existing tests to tenant principal).
- **Discovery relevance:** golden-set of vibe queries → expected track tags in top-k; assert metadata filters (BPM/energy/explicit) hold.
- **Session reactivity:** signal → next track respects no-repeat + energy curve.
- **Enforcement:** declined charge → stream stops; expired grant → renew-or-stop.
- **Tenant isolation:** tenant A key cannot read tenant B usage/wallet; publishable key cannot charge.
- **MCP contract:** each tool's input/output schema validated; auth required.
- **End-to-end:** agent-demo-style script drives search → session → charge → stream against a seeded catalog.

---

## 8. Build order

1. **Catalog enrichment + embeddings** — schema columns + backfill the existing catalog (idempotent script).
2. **`/discover` endpoint** — embed query + vector/cosine rank + metadata re-rank.
3. **DJ session endpoints** — `/sessions`, `/sessions/{id}/next` with session state in DynamoDB.
4. **Tenant principal generalization** — wallet/meter key from `USER#` to any principal; tenant + key tables; key-auth scopes.
5. **MCP server** — tools over the HTTP API (internals from `agent-demo.mjs`).
6. **Web SDK** — metered player wrapper + auto-stop.
7. **Dashboard + demo console** — extend the Vercel app; live meter + DynamoDB/DSQL visibility for the submission.
8. **Tests + architecture diagram + demo video assets.**

Each step is independently testable and ships a real increment of the production platform.
