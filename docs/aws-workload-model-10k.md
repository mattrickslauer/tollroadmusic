# TollRoad — AWS Workload Model @ 10,000 MAU

An **AWS-native workload estimate**, computed by the AWS Billing & Cost
Management **Pricing Calculator** (`bcm-pricing-calculator`) — not a spreadsheet.
Every line is priced by AWS itself from the live us-east-1 rate card. This is the
machine-checked counterpart to the hand math in [`COST_ESTIMATE.md`](./COST_ESTIMATE.md).

| | |
|---|---|
| **Workload estimate** | `tollroad-10k-mau` |
| **Estimate ID** | `7da9ae2c-a1c4-4329-9fb4-5339086507a8` |
| **Account** | `821135790223` (us-east-1) |
| **Rate type** | `BEFORE_DISCOUNTS` (public list price) |
| **Rate timestamp** | 2026-06-12 |
| **AWS-computed total** | **$957.24 / month** |

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
160 kbps (1.2 MB/min), 10 HLS requests/min, `/api/renew` every ~45s, the rollup
batching 100 events/invocation, and a 10,000-track catalog (~36 GB). A 5%
CloudFront cache-miss rate drives the S3 origin GETs and KMS decrypts (the latter
only because S3 Bucket Keys are not yet enabled on the audio bucket — see below).

The exact inputs are version-controlled in
[`aws-workload-model-10k.usage.json`](./aws-workload-model-10k.usage.json) and can
be re-applied with `aws bcm-pricing-calculator batch-create-workload-estimate-usage`.

---

## AWS-computed cost — per line (list price, gross)

Sorted by cost, exactly as AWS returned it:

| Service | Usage type | Monthly quantity | AWS cost |
|---|---|---:|---:|
| CloudFront | `US-DataTransfer-Out-Bytes` | 9,804 GB | **$833.34** |
| CloudFront | `US-Requests-Tier2-HTTPS` | 81,700,000 req | $81.70 |
| DynamoDB | `WriteRequestUnits` (on-demand) | 32,680,000 WRU | $20.43 |
| KMS | `KMS-Requests` (decrypt) | 4,085,000 req | $12.26 |
| Aurora DSQL | `DistributedProcessingUnits` | 596,410 DPU | $4.77 |
| S3 | `Requests-Tier2` (origin GET) | 4,085,000 req | $1.63 |
| KMS | `KMS-Keys` | 1 key | $1.00 |
| S3 | `TimedStorage-ByteHrs` (catalog) | 36 GB-Mo | $0.83 |
| DynamoDB | `ReadRequestUnits` (on-demand) | 4,085,000 RRU | $0.51 |
| Lambda | `Lambda-GB-Second` | 20,915 GB-s | $0.35 |
| Aurora DSQL | `Storage-ByteHrs` | 0.8 GB-Mo | $0.26 |
| Lambda | `Request` | 817,000 req | $0.16 |
| DynamoDB | `TimedStorage-ByteHrs` (events) | 2.4 GB-Mo | $0.00 |
| **TOTAL** | | | **$957.24** |

> DynamoDB event storage shows **$0** because the on-demand rate card's first
> 25 GB-month tier is priced at $0 — AWS applied it automatically. The other
> *always-free* tiers (CloudFront, DSQL, Lambda, KMS) are **billing credits**, not
> part of the rate card, so the Pricing Calculator quotes them at full price. See
> the reconciliation below for the net first-bill.

---

## Gross vs. net first-bill (applying the always-free tiers)

The Pricing Calculator quotes **gross list price**. The AWS perpetual free tiers
are credited at billing time and bring the *actual first bill* down:

| Free-tier credit | Amount |
|---|---:|
| CloudFront egress — first 1 TB | −$85.00 |
| CloudFront requests — first 10M | −$10.00 |
| Aurora DSQL — first 100K DPU | −$0.80 |
| Lambda — first 1M req + 400K GB-s | −$0.51 |
| KMS — first 20K requests | −$0.06 |
| **Net first-bill (Bucket Keys OFF)** | **≈ $860.87** |
| ...with **S3 Bucket Keys ON** (KMS decrypt → ~$0) | **≈ $848.67** |

The $848.67 net figure matches the ~$848/mo in `COST_ESTIMATE.md` — the two
methods (AWS calculator vs. hand math) agree to within rounding.

---

## What this surfaces that the hand math glossed

1. **KMS decrypt is a real $12.26/mo line** at this scale, *entirely* because the
   audio bucket doesn't set `bucketKeyEnabled` (`infra/lib/tollroad-stack.ts`).
   Turning Bucket Keys on collapses it to ~$0 — the single highest-ROI one-line
   change in the stack.
2. **CloudFront is 95.6% of the gross bill** ($915 of $957). TollRoad is a
   bandwidth business; the entire data + compute plane (DynamoDB + DSQL + Lambda +
   S3 + KMS-key) is ~$28/mo combined.
3. **Per active user: $0.096/mo gross, ~$0.085/mo net** — consistent with the
   marginal 9.4¢/user/mo in the unit-economics doc.

---

## Reproduce from scratch

```bash
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
