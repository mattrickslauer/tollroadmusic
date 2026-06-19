# Deploying

```bash
cd infra
npm run deploy            # guarded: cdk deploy with all Lambda secrets from backend/.env
npm run deploy:check      # validate backend/.env + print the plan, deploy nothing
npm run deploy -- --profile prod --require-approval never   # forward extra cdk args after --
```

`deploy.mjs` exists because the Lambda's secrets (`TOLLROAD_SESSION_SECRET`, the
CloudFront signing key, Stripe, Telegram, …) live **outside** CloudFormation —
the stack only writes them when handed in via `-c name=value`
(`lib/tollroad-stack.ts`). A bare `cdk deploy` silently omits them and **wipes
them from the live Lambda**; the usual casualty is auth (no session secret →
`/auth/me` returns `authConfigured:false` and OTP sign-in 503s). The script reads
`backend/.env` (the canonical restore source), refuses to deploy if any required
secret is missing or `TOLLROAD_SESSION_SECRET` is under 32 chars, then forwards
them all as context.

> Avoid `npm run deploy:raw` (plain `cdk deploy`) unless you know you want to
> drop the out-of-band secrets — it's the foot-gun this script replaces.

# Demo catalog seeding

Seeds the platform with **55 artists** and **~217 tracks** of playable music plus
**30 days of earnings history**, so `/browse` and the artist dashboards look real
in a demo. Everything is deterministic and idempotent — re-running refreshes
rather than duplicates.

## One-time: generate assets

```bash
cd infra
npm install
npm run seed:assets      # ffmpeg → frontend/public/audio/demo/*.mp3 + covers/*.svg
```

This renders an **original** instrumental audio pool (12 loops, synthesised with
ffmpeg — no licensing concerns) and a deterministic SVG cover for every artist
and track. Requires `ffmpeg` on PATH. The generated files live under
`frontend/public/` and are served statically (same as the original demo track),
so the demo plays with **no S3/CloudFront** wiring.

## Seed the database

```bash
cd infra
# point at your DSQL cluster (same endpoint as `npm run migrate`)
export TOLLROAD_DSQL_ENDPOINT=<cluster>.dsql.us-east-1.on.aws
npm run migrate          # adds cover_image_key / avatar_key columns if missing
npm run seed:demo        # upserts artists, tracks, daily summaries, recent ledger
```

- `npm run seed:demo -- --dry-run` — build the dataset and write
  `seed-preview.json` without touching the database (also the default when
  `TOLLROAD_DSQL_ENDPOINT` is unset).
- `npm run seed:reset` — delete the demo rows first, then re-seed.

## How it fits together

| File | Role |
|------|------|
| `demo-data.mjs` | Curated artists + deterministic ids/PRNG. Single source of truth shared by both scripts. |
| `gen-demo-assets.mjs` | ffmpeg audio pool + SVG covers → `frontend/public`. |
| `seed-demo.mjs` | Upserts into DSQL (`artists`, `tracks`, `artist_daily_summary`, `royalty_ledger`). |

The catalog is then served by `frontend/app/browse/page.tsx` (reads via
`frontend/lib/catalog.ts`) and `GET /api/catalog`.

> The generated assets under `frontend/public/audio/demo` and
> `frontend/public/covers` are committed so the demo deploys without an ffmpeg
> step in CI. Regenerate them anytime with `npm run seed:assets`.
