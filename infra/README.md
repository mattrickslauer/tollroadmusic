# TollRoad — Infrastructure (AWS CDK)

Base infra for the TollRoad billing layer. One stack, all in **us-east-1**.

## What it provisions

| Resource | Role |
|---|---|
| **DynamoDB `tollroad`** | Metering hot path — real-time balance (conditional decrement) + metered-minute events (TTL), plus the DJ vector store (`TVEC`) and session state (`SESSION#`). `NEW_AND_OLD_IMAGES` stream drives the projector. GSI1 for reverse lookups. |
| **Aurora DSQL cluster** | Scale-to-zero system-of-record — catalog, accounts, library, append-only royalty ledger, per-artist/day summaries, payouts, and mood/consensus. |
| **KMS CMK** (`alias/tollroad-audio`) | SSE-KMS for audio at rest; rotation on. CloudFront OAC granted `kms:Decrypt`. |
| **S3 `tollroad-audio-<acct>`** | Audio objects, SSE-KMS, fully private (CloudFront-only reads, presigned PUT for uploads). |
| **CloudFront audio (OAC)** | Audio delivery; **signed-URL gated** via a CloudFront key group (the meter's enforcement point). |
| **S3 + CloudFront images** | Public artist avatars + track covers (separate bucket/distribution, no signing). |
| **Lambda `ProjectorConsumerFn`** | Streams consumer → idempotent royalty ledger writes + summary/top-up/reconciliation maintenance (pg + DSQL signer layer `DsqlDepsLayer`). Runs as a least-privilege DML role. |
| **API Gateway `tollroad-api` + `ApiFn`** | The `/v1` REST API (one bundled `NodejsFunction`). Usage plan with two API keys: `tollroad-app` (frontend) and `tollroad-demo-agent` (agents). `apiKeyRequired` on all routes except the Stripe webhook. |
| **IAM policy (output)** | Least-privilege doc to attach to the external `tollroad-vercel` user. |

## Deploy

```bash
npm install

# 1) Generate a CloudFront signing keypair (for the signed-cookie gate).
openssl genrsa -out cf_private_key.pem 2048
openssl rsa -pubout -in cf_private_key.pem -out cf_public_key.pem
#    Keep cf_private_key.pem in the app env as TOLLROAD_CF_PRIVATE_KEY (it signs
#    cookies). The PUBLIC key is registered in CloudFront below.

# 2) Bootstrap (first time in the account/region) and deploy.
npx cdk bootstrap
npx cdk deploy -c cfPublicKey="$(cat cf_public_key.pem)"

# 3) Apply the DSQL schema (endpoint from the stack output).
#    The DDL is millicents-native; also run the mood (Vibe Pad) migration.
TOLLROAD_DSQL_ENDPOINT=<DsqlEndpoint output> npm run migrate
TOLLROAD_DSQL_ENDPOINT=<DsqlEndpoint output> node ../backend/scripts/migrate-mood.mjs
```

> **Note on currency:** the schema is already in **millicents** (cents × 1000).
> `scripts/migrate-millicents.mjs` exists to convert a legacy cents cluster — a
> fresh `migrate-dsql.mjs` does **not** need it. (See the migration note in the
> team memory before re-running anything against the shared cluster.)

Wire the stack outputs into the app env (`TOLLROAD_DSQL_ENDPOINT`, `TOLLROAD_AUDIO_BUCKET`, `TOLLROAD_CDN_DOMAIN`, `CfKeyGroupId`, the CloudFront key-pair id, `TOLLROAD_CF_PRIVATE_KEY`), and attach `VercelUserPolicyJson` to the `tollroad-vercel` IAM user.

Without `-c cfPublicKey`, the distribution deploys **open** (no signed-cookie gate) so you can bring the pipeline up first — lock it down before the demo.

## Notes

- Hackathon posture: every resource has `removalPolicy: DESTROY` / `autoDeleteObjects` so `cdk destroy` is clean. Flip to `RETAIN` for anything real.
- The data model (DynamoDB item shapes + DSQL DDL) is documented in [`../docs/data-model.md`](../docs/data-model.md).
- Cost model: [`../docs/cost/COST_ESTIMATE.md`](../docs/cost/COST_ESTIMATE.md).
