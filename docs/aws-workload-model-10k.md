# TollRoad — AWS Workload Model @ 10,000 MAU

An **AWS-native workload estimate**, computed by the AWS Billing & Cost
Management **Pricing Calculator** (`bcm-pricing-calculator`) — not a spreadsheet.
Every line is priced by AWS itself from the live us-east-1 rate card. This is the
machine-checked counterpart to the hand math in [`COST_ESTIMATE.md`](./COST_ESTIMATE.md).

> **Re-modeled 2026-06-18 for the API re-platform.** The deployed data path is now
> a standalone backend (**API Gateway REST → one `tollroad-api` Lambda → Aurora
> DSQL**), with the Vercel frontend as a pure client proxying to it. Audio still
> streams **S3 → signed CloudFront** (unchanged). The estimate was updated
> in place — see "What changed" below.

| | |
|---|---|
| **Workload estimate** | `tollroad-10k-mau` |
| **Estimate ID** | `7da9ae2c-a1c4-4329-9fb4-5339086507a8` |
| **Account** | `821135790223` (us-east-1) |
| **Rate type** | `BEFORE_DISCOUNTS` (public list price) |
| **Rate timestamp** | 2026-06-12 |
| **AWS-computed total** | **$948.40 / month** *(was $957.24 on the pre-re-platform topology)* |

Retrieve it any time:

```bash
aws bcm-pricing-calculator get-workload-estimate \
  --identifier 7da9ae2c-a1c4-4329-9fb4-5339086507a8 --region us-east-1
aws bcm-pricing-calculator list-workload-estimate-usage \
  --workload-estimate-id 7da9ae2c-a1c4-4329-9fb4-5339086507a8 --region us-east-1
```

Or open it in the console: **Billing and Cost Management → Pricing Calculator →
Workload estimates → `tollroad-10k-mau`**.

---

## Workload assumptions (the usage inputs)

10,000 monthly active users × 817 min/user = **8.17M streamed minutes/month**, at
160 kbps (1.2 MB/min), a 10,000-track catalog (~36 GB), and a 5% CloudFront
cache-miss rate that drives the S3 origin GETs and KMS decrypts (the latter only
because S3 Bucket Keys are not yet enabled on the audio bucket — see below). The
re-platform adds two usage drivers that did not exist on the AWS bill before:

- **Audio is one mp3 per track behind signed CloudFront** (not HLS segments).
  Egress is identical (1.2 MB/min), but request count drops: the browser pulls
  each track in a handful of range GETs (~2/min modeled) instead of ~10
  HLS-segment requests/min.
- **Every API call now hits API Gateway (REST) + the `tollroad-api` Lambda.**
  The metering hot path is `POST /v1/charge`, called ~once per streamed minute
  (idempotent per `user#track#minute`). Modeled at ~14M API requests/month
  (≈ 8.2M charges + grant refreshes + browse/library navigation). Previously this
  ran as Vercel functions and was **off the AWS bill entirely**.
- **Metering is a dual-write.** The charge handler writes the authoritative
  balance + ledger transactionally to **Aurora DSQL** (`backend/src/domain/billing.ts`)
  *and* mirrors one METER event to **DynamoDB** (`backend/src/domain/meter.ts`),
  whose stream still drives the rollup Lambda. DSQL is the system of record; the
  DynamoDB mirror is best-effort and reconciles to a no-op via the shared
  idempotency key.

The exact inputs are version-controlled in
[`aws-workload-model-10k.usage.json`](./aws-workload-model-10k.usage.json) and can
be re-applied with `aws bcm-pricing-calculator batch-create-workload-estimate-usage`.

---

## AWS-computed cost — per line (list price, gross)

Sorted by cost, exactly as AWS returned it:

| Service | Usage type | Monthly quantity | AWS cost |
|---|---|---:|---:|
| CloudFront | `US-DataTransfer-Out-Bytes` | 9,804 GB | **$833.34** |
| **API Gateway (REST)** | `USE1-ApiGatewayRequest` | 14,000,000 req | **$49.00** |
| CloudFront | `US-Requests-Tier2-HTTPS` | 16,340,000 req | $16.34 |
| Aurora DSQL | `DistributedProcessingUnits` | 1,800,000 DPU | $14.40 |
| KMS | `KMS-Requests` (decrypt) | 4,085,000 req | $12.26 |
| DynamoDB | `WriteRequestUnits` (on-demand) | 16,340,000 WRU | $10.21 |
| Lambda | `Lambda-GB-Second` | 370,000 GB-s | $6.17 |
| Lambda | `Request` | 14,800,000 req | $2.96 |
| S3 | `Requests-Tier2` (origin GET) | 4,085,000 req | $1.63 |
| KMS | `KMS-Keys` | 1 key | $1.00 |
| S3 | `TimedStorage-ByteHrs` (catalog) | 36 GB-Mo | $0.83 |
| Aurora DSQL | `Storage-ByteHrs` | 0.8 GB-Mo | $0.26 |
| DynamoDB | `TimedStorage-ByteHrs` (events) | 2.0 GB-Mo | $0.00 |
| **TOTAL** | | | **$948.40** |

> DynamoDB event storage shows **$0** because the on-demand rate card's first
> 25 GB-month tier is priced at $0 — AWS applied it automatically. The other
> *always-free* tiers (CloudFront, DSQL, Lambda, KMS) are **billing credits**, not
> part of the rate card, so the Pricing Calculator quotes them at full price. See
> the reconciliation below for the net first-bill. **API Gateway REST has no
> perpetual free tier** (only a 12-month one), so its $49 is real from month one.

---

## What changed vs. the pre-re-platform estimate

| Line | Before ($957.24 model) | After ($948.40 model) | Why |
|---|---:|---:|---|
| **API Gateway (REST)** | — (Vercel functions, off-bill) | **+$49.00** | the whole API surface now runs on AWS |
| CloudFront requests | $81.70 (HLS 10/min) | $16.34 | one mp3 + range GETs (~2/min), not 10 HLS segments |
| DynamoDB writes | $20.43 (4 WRU/min) | $10.21 | balance moved to DSQL; DDB keeps only the METER event + GSI replica (2 WRU/min, 1/min) |
| DynamoDB reads | $0.51 | **removed** | dup-check is now a DSQL query; no DynamoDB GetItem/Query in the backend |
| Aurora DSQL DPU | $4.77 (rollup only) | $14.40 | DSQL now runs the synchronous charge transaction + all catalog/library reads, on top of the rollup |
| Lambda | $0.51 (rollup only) | $9.13 | one `tollroad-api` invocation per API request (~14M), plus the rollup |
| CloudFront egress | $833.34 | $833.34 | audio path unchanged |
| KMS / S3 | $15.72 | $15.72 | SSE-KMS + origin GETs unchanged |

**Net: −$8.84/month.** The new API Gateway + Lambda + DSQL load (≈ +$67) is more
than offset by the DynamoDB shrink (−$11) and the HLS→mp3 request drop (−$65). The
mp3 request line is the softest assumption: if a player issues closer to 10 range
GETs/min the CloudFront-requests line returns toward $80 and the total lands near
**$1,013** (≈ +6% vs. the old topology). Either way the headline is unmoved —
CloudFront egress dominates.

---

## Gross vs. net first-bill (applying the always-free tiers)

The Pricing Calculator quotes **gross list price**. The AWS perpetual free tiers
are credited at billing time and bring the *actual first bill* down:

| Free-tier credit | Amount |
|---|---:|
| CloudFront egress — first 1 TB | −$85.00 |
| CloudFront requests — first 10M | −$10.00 |
| Lambda — first 1M req + 400K GB-s | −$6.37 *(370K GB-s ≤ 400K → duration all free)* |
| Aurora DSQL — first 100K DPU | −$0.80 |
| KMS — first 20K requests | −$0.06 |
| **Net first-bill (Bucket Keys OFF)** | **≈ $846.17** |
| ...with **S3 Bucket Keys ON** (KMS decrypt → ~$0) | **≈ $833.91** |

> **API Gateway is not discounted** — its 1M-request free tier expires after 12
> months, so the $49 stands. It is the largest *un-subsidized* non-CloudFront line.

The ~$846 net figure matches the ~$846/mo in `COST_ESTIMATE.md` — the two methods
(AWS calculator vs. hand math) agree to within rounding. Per active user:
**$0.095/mo gross, ~$0.085/mo net** — unchanged from the pre-re-platform model.

---

## What this surfaces that the hand math glossed

1. **API Gateway REST is the largest new line ($49/mo)** and the largest
   un-subsidized non-CloudFront cost. The gateway is `apigw.RestApi`
   (`infra/lib/tollroad-stack.ts`); **switching to an HTTP API drops the rate
   from $3.50/M to $1.00/M** (`USE1-ApiGatewayHttpRequest`) — a ~$35/mo saving at
   this scale and the top cost lever after bitrate.
2. **KMS decrypt is still a real $12.26/mo line**, *entirely* because the audio
   bucket doesn't set `bucketKeyEnabled`. Turning Bucket Keys on collapses it to
   ~$0 — still the single highest-ROI one-line change in the stack.
3. **CloudFront is 89.5% of the gross bill** ($849.68 of $948.40). TollRoad is
   still a bandwidth business; the entire request/compute/data plane (API Gateway
   + Lambda + DynamoDB + DSQL + S3 + KMS-key) is ~$99/mo combined — up from ~$28
   before, almost all of it the new API Gateway + Lambda tier.
4. **Aurora DSQL DPU is modeled, not measured** — 1.8M DPU/mo (≈3× the old
   rollup-only figure) is a placeholder for the synchronous charge transaction +
   read APIs. Validate against `AWS/AuroraDSQL` `TotalDPU` once real load runs;
   even at 5× it stays under 3% of the bill.

---

## Reproduce / re-apply from scratch

```bash
# read the current estimate (already updated in place)
aws bcm-pricing-calculator get-workload-estimate \
  --identifier 7da9ae2c-a1c4-4329-9fb4-5339086507a8 --region us-east-1

# OR re-create from the version-controlled usage file:
# 1. create the estimate
aws bcm-pricing-calculator create-workload-estimate \
  --name tollroad-10k-mau --rate-type BEFORE_DISCOUNTS --region us-east-1

# 2. load the usage lines (use the id from step 1)
aws bcm-pricing-calculator batch-create-workload-estimate-usage \
  --workload-estimate-id <ID> \
  --usage file://docs/aws-workload-model-10k.usage.json --region us-east-1

# 3. read the computed total + per-line costs
aws bcm-pricing-calculator get-workload-estimate --identifier <ID> --region us-east-1
```

Scale to other MAU counts by multiplying every `amount` in the usage JSON by
`(target_MAU / 10000)` — all lines are linear in minutes except the fixed
`KMS-Keys` ($1) and `S3 TimedStorage` (catalog, constant).
