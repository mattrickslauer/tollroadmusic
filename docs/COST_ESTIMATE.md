# TollRoad — Workload Cost Estimate

All resources in **us-east-1**, on-demand pricing (verified June 2026). Two
scales matter and they tell different stories:

- **Demo / judging scale** — what actually runs during H0. Effectively **$0/mo**: everything fits inside perpetual free tiers and **Aurora DSQL + Lambda scale to zero when idle**. This is the literal "Hack the Zero Stack" answer.
- **Early-traction scale — 10,000 MAU.** Realistic startup unit economics. Here a single line — **CloudFront audio egress — is ~96% of the bill**, and it's a clean per-minute pass-through cost the per-minute price more than covers.

---

## Workload anchor (10K MAU)

| Assumption | Value |
|---|---|
| Monthly active listeners | 10,000 |
| Minutes played / listener / mo | ~817 (9,800/yr ÷ 12) |
| **Total billed minutes / mo** | **8.17 M** |
| Audio bitrate (HLS) | 160 kbps → **1.2 MB/min** |
| Meter writes / billed minute | 2 (conditional balance decrement + metered event) |
| Price to listener | ~**$0.01 / min** (≈ $8.17/listener/mo, beats the $11.99 flat plan) |

---

## Per-service cost @ 10K MAU

| Service | Driver & math | $/mo |
|---|---|---:|
| **CloudFront** (egress) | 8.17M min × 1.2 MB = **9.8 TB**; minus 1 TB always-free = 8.8 TB × $0.085/GB | **~750** |
| **DynamoDB** (on-demand) | writes 16.3M WRU × $0.625/M = $10.2 · streams 8.17M ÷ 100K × $0.02 = $1.6 · reads ~$0.3 · storage <25 GB = **free** | ~12 |
| **Bedrock** (Claude Haiku) | "explain my statement" — ~3K calls (~4.5M in × $1/M + ~1.2M out × $5/M) | ~10 |
| **Aurora DSQL** | rollup writes + catalog/dashboard reads; **modeled** ~600K DPU (−100K free) × $8/M + <1 GB storage. **Scales to zero idle.** | ~5 |
| **KMS** | 1 CMK × $1 + minimal requests (S3 Bucket Keys cut KMS calls ~99%) | ~1 |
| **S3** (Standard) | ~25 GB catalog × $0.023 + origin-miss GETs (CloudFront absorbs the rest) | ~1 |
| **Lambda** | rollup only (~82K invocations, ~8K GB-s) — **inside the 1M req / 400K GB-s free tier** | ~0 |
| **Total** | | **~$779/mo** |

> `/api/renew` (the hot path) runs as a **Next.js route on Vercel**, so it isn't on the AWS bill — the AWS Lambda line is the Streams rollup alone.

### The bill is 96% CDN — and that's fine

Audio streaming is bandwidth-bound; **CloudFront egress is the only line that scales with usage**, and it's a pure pass-through COGS:

- **CDN cost per minute** ≈ $750 ÷ 8.17M = **~$0.000092/min** (≈ 0.0092¢).
- At a **$0.01/min** price that's **~0.9% of revenue**. Gross billed ≈ $81.7K/mo; total infra $779 ≈ **0.95% of gross billed**.
- A platform take of just **1% of billed minutes (~$817/mo)** already covers the entire infrastructure bill. Margin is structurally high because everything except bytes-on-the-wire is near-free and serverless.

---

## Scaling levers (in priority order)

1. **Audio bitrate — the dominant lever.** Egress scales linearly with it. 160 → 128 kbps cuts the CDN line ~20%; 96 kbps (still fine for casual listening) ~40%. Offer quality tiers; default mobile to a lower bitrate.
2. **Cache-hit ratio.** Popular catalog served from CloudFront edge → S3 origin GETs and KMS calls stay negligible. Long TTLs on immutable audio segments.
3. **S3 Bucket Keys** on the SSE-KMS bucket — collapses per-object KMS requests ~99%, keeping KMS at ~$1 (the key) regardless of traffic.
4. **DSQL scale-to-zero** — no idle compute between billing runs; the 100K-DPU/mo free allowance covers low traffic outright. (This is why DSQL over Aurora Serverless v2 — the latter bills idle ACUs.)
5. **Per-minute (not per-second) metering** — the billing unit is one write/minute, not 60. Keeps DynamoDB writes and the ledger 60× smaller for no billing loss.

## Demo / judging scale ≈ $0/mo

At the handful-of-listeners scale the submission actually runs:
- CloudFront egress well under **1 TB free**; DynamoDB under **25 GB free** + pennies of requests; DSQL under **100K DPU free**; Lambda under free tier; Bedrock a few cents.
- The only standing charge is the **~$1/mo KMS key**. **Idle cost is effectively zero** — nothing is provisioned-always-on; DSQL and Lambda are dormant until hit.

---

## Caveats (stated honestly — judges are AWS DB PMs)

- **Aurora DSQL DPU consumption is modeled, not measured.** DPU-per-operation is workload-specific; the ~600K DPU/mo figure is a conservative estimate. Validate against the AWS Pricing Calculator / actual CloudWatch DPU metrics once the rollup is live. Rate used: **$8.00 per million DPUs**, $0.33/GB-mo, first 100K DPU + 1 GB free (Aurora DSQL pricing page).
- **Bedrock Haiku 4.5 token price ($1 in / $5 out per 1M)** is corroborated against Anthropic list pricing but the live AWS Bedrock pricing page returned a stale snapshot at capture time — confirm in-console before quoting.
- **CloudFront always-free tier (1 TB egress + 10M requests/mo, perpetual) is confirmed**, but the AWS Pricing Calculator does **not** model it — the calculator will read ~$830 (list) where the real bill is ~$750. Treat the calculator as a conservative ceiling on the CDN line.
- All other rates (DynamoDB, Lambda, S3, KMS) pulled directly from official AWS pricing pages, us-east-1.
