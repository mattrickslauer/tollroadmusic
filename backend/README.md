# TollRoad Backend API

The standalone backend — the **system of record** for TollRoad. Everything that
touches a database lives here; the Next.js front-end, third-party apps, and AI
agents are all just clients of this one API.

It runs **two ways from one codebase** (`src/router.ts` is the single route table):

- **Production** — one Lambda behind **API Gateway (REST, stage `/v1`)**. See
  `../infra/lib/tollroad-stack.ts` (`ApiFn` + `TollroadApi` + usage plan).
- **Local dev** — a plain Node HTTP server (`src/local-server.ts`) exposing the
  identical contract on `http://localhost:8787/v1`.

```
src/
  lib/        dsql · jwt · http (ApiRequest/Response) · cors · x402
  domain/     framework-free logic (ported from the old frontend lib/server/*)
  handlers/   one module per route group + authorizer
  router.ts   METHOD+path → handler (used by lambda.ts AND local-server.ts)
  lambda.ts   API Gateway proxy adapter
  local-server.ts   Node http adapter (npm run dev)
openapi.yaml  the /v1 contract (x402 402 bodies documented here)
```

## The x402 protocol (crypto-free)

Streaming is gated by the x402 *shape* — `request → 402 → pay → retry` — but the
settlement rail is the listener's **prepaid wallet reconciled in Aurora DSQL**,
not a blockchain.

```
GET  /v1/stream/{trackId}        → 402 { x402Version, accepts:[{ scheme:"prepaid",
                                          asset:"usd", maxAmountRequired, payTo }] }
POST /v1/charge { trackId }      → 200 { balanceCents, charged }   (the payment)
GET  /v1/stream/{trackId}        → 200 { url, expiresAt, mode }    (now authorized)
```

`mode` is `signed-url` (a short-lived CloudFront signed URL — audio streams from
the CDN, never through Lambda) or `proxy` (local dev: bytes via `/stream/{id}/raw`,
Range-aware). The payment is a conditional **DynamoDB** balance debit plus a
meter event, idempotent per `user#track#minute`; the append-only DSQL
`royalty_ledger` row is built downstream by the projector (see below).

## Polyglot CQRS — command path vs. read models

Writes and reads now live in **different databases** (full CQRS):

- **Command side (hot path) → Amazon DynamoDB.** `/charge` does a conditional
  `UpdateItem` debit (`balanceCents >= cost`, can never go negative) and writes a
  meter event with `attribute_not_exists` so each `user#track#minute` lands exactly
  once. Top-ups credit the same **authoritative** DynamoDB balance. This is the
  single-digit-ms money path; `/balance` real-time and the stream gate
  (`hasRecentMeter`) read DynamoDB.
- **Streams → projector Lambda → Aurora DSQL (read models / SoR).** DynamoDB
  Streams fan `INSERT`s (`METER`, `TOPUP`) into a projector that builds DSQL: the
  append-only `royalty_ledger` (system of record), `artist_daily_summary`, the
  `wallet_topups` history, and the eventually-consistent **reconciliation** balance
  (`listener_profiles.balance_cents`). DSQL serves cheap relational/BI reads and
  scales to zero between projection runs.

**Rollup-ordering fix.** Previously the synchronous charge wrote the DSQL ledger
itself, front-running the rollup so the projector always hit `ON CONFLICT DO
NOTHING` and `artist_daily_summary` never updated. Now the **command writes only
to DynamoDB** and the **projector is the only writer of the DSQL ledger,
summaries, and reconciliation balance** — the conflict (and the bug) is gone by
construction. The projector is at-least-once and idempotent on
`royalty_ledger.idempotency_key`.

## Auth

- **End users** present the session **JWT** (`Authorization: Bearer`, or the
  `tollroad_session` cookie via the front-end proxy). Minted by
  `POST /v1/auth/otp/verify`, verified inside the handlers (`lib/http.ts`) and by
  the API Gateway authorizer (`handlers/authorizer.ts`).
- **Programmatic consumers / agents** present a **usage-plan API key**
  (`x-api-key`) for throttling + quota.

## Run locally

```bash
npm install
# minimal env (export before running):
export TOLLROAD_SESSION_SECRET="<32+ random chars>"
export TOLLROAD_OTP_PEPPER="<32+ random chars>"   # dedicated OTP pepper; falls
                                                  # back to the session secret if unset
export TOLLROAD_DSQL_ENDPOINT="<cluster>.dsql.us-east-1.on.aws"   # + AWS creds
# optional: STRIPE_SECRET_KEY, TOLLROAD_SES_SENDER, TOLLROAD_CDN_DOMAIN,
#           TOLLROAD_CF_KEY_PAIR_ID, TOLLROAD_CF_PRIVATE_KEY, TOLLROAD_ALLOWED_ORIGINS,
#           TOLLROAD_DSQL_USER (DML-only role in prod; default "admin"),
#           TOLLROAD_TABLE (DynamoDB command store; required for the prod hot path)
npm run dev          # → http://localhost:8787/v1
npm test             # router + x402 unit tests
npm run typecheck
```

Point the front-end at it with `TOLLROAD_API_BASE=http://localhost:8787/v1` (and
optionally `TOLLROAD_APP_API_KEY`). Apply the schema with
`../infra/scripts/migrate-dsql.mjs`.

## The x402 agent demo

`../scripts/agent-demo.mjs` walks the full loop as a programmatic client:

```bash
API_BASE=http://localhost:8787/v1 TOLLROAD_TOKEN=<jwt> node ../scripts/agent-demo.mjs
# discovers a track → 402 → pays a minute → gets a stream grant
```

## Notes

- The charge path is **DynamoDB-first** (the conditional decrement + meter event);
  the DSQL ledger, summaries, and reconciliation balance are built asynchronously by
  the Streams projector. See "Polyglot CQRS" above for the read/write split and the
  rollup-ordering fix.
- The Node 20 Lambda runtime ships the AWS SDK v3 — it's marked external in the
  esbuild bundle (`infra` `NodejsFunction`).

## Security hardening

- **Separate OTP pepper** — `domain/otp.ts` hashes codes with `TOLLROAD_OTP_PEPPER`
  (independent from the session-signing key), falling back to
  `TOLLROAD_SESSION_SECRET` with a one-time warning if unset.
- **CORS fail-closed in prod** — `lib/cors.ts` will not echo an arbitrary request
  Origin with `Allow-Credentials:true` when `NODE_ENV=production` and
  `TOLLROAD_ALLOWED_ORIGINS` is empty; it sends a blank ACAO so the browser blocks
  the credentialed response. Local/dev keeps the permissive echo.
- **Least-privilege DSQL user** — `lib/dsql.ts` connects as `TOLLROAD_DSQL_USER`
  (default `admin` for the demo; provision a DML-only role in production).
