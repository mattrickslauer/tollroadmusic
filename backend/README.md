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
Range-aware). The payment is a conditional balance debit + an append-only
`royalty_ledger` row, idempotent per `user#track#minute`.

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
export TOLLROAD_DSQL_ENDPOINT="<cluster>.dsql.us-east-1.on.aws"   # + AWS creds
# optional: STRIPE_SECRET_KEY, TOLLROAD_SES_SENDER, TOLLROAD_CDN_DOMAIN,
#           TOLLROAD_CF_KEY_PAIR_ID, TOLLROAD_CF_PRIVATE_KEY, TOLLROAD_ALLOWED_ORIGINS
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

- The synchronous charge path is **DSQL-only** (the conditional decrement +
  ledger insert run in one transaction). DynamoDB + the Streams rollup remain the
  documented high-write architecture; the live demo settles directly in DSQL.
- The Node 20 Lambda runtime ships the AWS SDK v3 — it's marked external in the
  esbuild bundle (`infra` `NodejsFunction`).
