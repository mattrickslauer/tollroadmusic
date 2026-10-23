# Runbook — deploying the backend stack

The full ordered sequence for a backend deploy, including the two steps that
`cdk deploy` does **not** do and that fail silently when skipped.

## Why this exists

Two prerequisites of a working deploy live outside CloudFormation, and neither
announces itself when missing. Both have taken the CQRS projector down in prod,
and in both cases nothing user-facing errors — the command path keeps debiting
balances on DynamoDB, so only the royalty ledger, `artist_daily_summary` and the
leaderboard quietly stop advancing:

| Missing step | Projector symptom in CloudWatch |
| --- | --- |
| DSQL Lambda layer not installed | `Cannot find module 'pg'` |
| `projector` DSQL role not provisioned | `unable to accept connection, access denied` (SQLSTATE `28000`) |

`npm run deploy` now refuses to run when the layer is unbuilt. The DSQL role is
not something a deploy can check from outside the cluster, so it stays a
deliberate step — `npm run provision:projector` makes it one command.

## Sequence

All commands run from `infra/`.

```bash
# 1. Build the DSQL Lambda layer.
#    The stack zips lambda/layers/dsql as-is and its node_modules/ is gitignored,
#    so a fresh checkout would otherwise publish an EMPTY layer.
npm run layer:install

# 2. Validate the deploy without running it. Checks every out-of-band secret is
#    present in backend/.env AND that step 1 actually happened.
npm run deploy:check

# 3. Deploy. Secrets are passed through as `-c key=value` context — never use a
#    bare `cdk deploy` (or `deploy:raw`), which strips them from the live Lambda.
npm run deploy

# 4. Apply any schema changes.
npm run migrate

# 5. Provision the projector's least-privilege DSQL role. Idempotent: safe to run
#    on every deploy, and required after anything that REPLACES the projector
#    Lambda, because its execution-role ARN changes and the old IAM GRANT goes stale.
npm run provision:projector
```

## Verifying

```bash
# The role exists and the projector can authenticate.
npm run provision:projector:check

# No 28000 / "Cannot find module" in the last 10 minutes of projector logs.
FN=$(aws lambda list-functions \
  --query "Functions[?contains(FunctionName,'ProjectorConsumerFn')].FunctionName" \
  --output text)
aws logs tail "/aws/lambda/$FN" --since 10m --format short

# Errors should be 0 over the window, not equal to Invocations.
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Errors \
  --dimensions Name=FunctionName,Value="$FN" \
  --start-time "$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --period 86400 --statistics Sum
```

The projector is stream-triggered from `LATEST`, so it is idle until a METER or
TOPUP record is written — zero invocations means no traffic, not health. Play a
track (or top up) and re-check.

## If the projector was down

Records that arrived while it was failing are past the stream's retention window
and are **not** replayed by fixing the role. The DynamoDB `METER` items are still
the source of truth, so the DSQL read models have to be rebuilt from them
separately — fixing the connection only stops the gap from growing.

## Frontend

The frontend deploys independently on Vercel from `main` (project
`tollroadmusic`). It reaches the backend through `frontend/app/api/v1/[...path]`,
which proxies to `TOLLROAD_API_BASE` using `APP_API_KEY` — both set in Vercel's
env, not in this repo. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` must be set there too
and must be the same Stripe mode (live/test) as the backend's secret key.
