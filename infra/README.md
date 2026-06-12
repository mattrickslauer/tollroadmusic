# TollRoad — Infrastructure (AWS CDK)

Base infra for the TollRoad billing layer. One stack, all in **us-east-1**.

## What it provisions

| Resource | Role |
|---|---|
| **DynamoDB `tollroad`** | Metering hot path — real-time balance (conditional decrement) + metered-minute events (TTL). `NEW_AND_OLD_IMAGES` stream drives the rollup. GSI1 for reverse lookups. |
| **Aurora DSQL cluster** | Scale-to-zero system-of-record — catalog, append-only royalty ledger, per-artist/day summaries. |
| **KMS CMK** (`alias/tollroad-audio`) | SSE-KMS for audio at rest; rotation on. CloudFront OAC granted `kms:Decrypt`. |
| **S3 `tollroad-audio-<acct>`** | Audio objects, SSE-KMS, fully private (CloudFront-only reads, presigned PUT for uploads). |
| **CloudFront (OAC)** | Audio delivery; **signed-cookie gated** via a CloudFront key group (the meter's enforcement point). |
| **Lambda `RollupConsumerFn`** | Streams consumer → idempotent royalty ledger writes + summary maintenance (pg + DSQL signer layer). |
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
TOLLROAD_DSQL_ENDPOINT=<DsqlEndpoint output> npm run migrate
```

Wire the stack outputs into the app env (`TOLLROAD_DSQL_ENDPOINT`, `TOLLROAD_AUDIO_BUCKET`, `TOLLROAD_CDN_DOMAIN`, `CfKeyGroupId`, the CloudFront key-pair id, `TOLLROAD_CF_PRIVATE_KEY`), and attach `VercelUserPolicyJson` to the `tollroad-vercel` IAM user.

Without `-c cfPublicKey`, the distribution deploys **open** (no signed-cookie gate) so you can bring the pipeline up first — lock it down before the demo.

## Notes

- Hackathon posture: every resource has `removalPolicy: DESTROY` / `autoDeleteObjects` so `cdk destroy` is clean. Flip to `RETAIN` for anything real.
- The data model (DynamoDB item shapes + DSQL DDL) is documented in [`../docs/data-model.md`](../docs/data-model.md).
- Cost model: [`../docs/COST_ESTIMATE.md`](../docs/COST_ESTIMATE.md).
