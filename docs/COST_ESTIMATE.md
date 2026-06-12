# TollRoad — Unit Economics (All-In AWS Cost to Stream)

What does it actually cost to stream one minute of music on TollRoad? This is a
bottom-up marginal cost across **every AWS service in the path**, expressed per
**minute**, per **song**, and per **user**. All rates are us-east-1 on-demand,
verified June 2026. Marginal = the incremental cost of one more minute (free
tiers are a fixed subsidy, excluded from the per-unit rate; treated separately
at the end).

---

## The canonical streamed minute

One minute of playback consumes a fixed, known basket of AWS resources:

| Dimension | Value | Why |
|---|---|---|
| Audio bitrate | **160 kbps** → **1.2 MB/min** | Music-quality HLS; bitrate is the dominant lever (see below) |
| CloudFront requests | **~10 / min** | HLS segments at ~6s each + manifest |
| DynamoDB writes | **2 / min** | conditional balance decrement + 1 metered event |
| DynamoDB stream records | **1 / min** | the metered event → rollup |
| Aurora DSQL ops | **1 ledger insert + 1 summary upsert** | append-only royalty credit |
| Lambda | **0.01 invocation/min** | rollup batches 100 events/invocation |
| KMS | **~0 calls/min** | SSE-KMS + S3 Bucket Keys + CloudFront cache → no per-play decrypt |

---

## Cost per minute streamed — every AWS service

Shown as **$ per 1,000 minutes** (the per-minute figures are fractions of a
cent, so 1,000 min is the readable anchor).

| AWS service | Unit math | $ / 1,000 min | % of total |
|---|---|---:|---:|
| **CloudFront — egress** | 1.2 GB × $0.085/GB | **0.10200** | **89.2%** |
| **CloudFront — requests** | 10,000 req × $0.01/10k | **0.01000** | **8.7%** |
| DynamoDB — writes | 2,000 WRU × $0.625/M | 0.00125 | 1.09% |
| DynamoDB — streams | 1,000 rec × $0.02/100k | 0.00020 | 0.17% |
| DynamoDB — storage (event TTL) | 0.3 KB/event, ~30-day resident | 0.00008 | 0.07% |
| DynamoDB — reads (live meter) | 0.5 RRU × $0.125/M | 0.00006 | 0.05% |
| Aurora DSQL — compute (DPU) | ~0.073 DPU/min × $8/M *(modeled)* | 0.00058 | 0.51% |
| Aurora DSQL — storage (ledger) | 100 B/min × $0.33/GB-mo | 0.00003 | 0.03% |
| KMS — key (amortized) | $1/mo ÷ 8.17M min | 0.00012 | 0.11% |
| S3 — origin GET + storage (amortized) | cache-miss reads only | 0.00010 | 0.09% |
| Lambda — rollup | ~0.01 req + GB-s (in free band) | 0.00000 | ~0% |
| **TOTAL** | | **0.11444** | **100%** |

**All-in marginal cost ≈ $0.0001144 per minute ≈ 0.0114¢ / minute.**

### Where the money actually goes

- **CloudFront (egress + requests) = ~98%** of the marginal cost. TollRoad is, economically, a **bandwidth business** wearing a database's clothes.
- **The entire data + compute plane — DynamoDB, Aurora DSQL, Lambda, KMS, S3 — is ~2%** combined (~$0.00242 per 1,000 min). Per stream, **the databases are effectively free**; serverless + scale-to-zero means you pay for work done, and the work per minute is tiny.

---

## Rolled up: per song, per user

| Unit | Minutes | All-in AWS cost |
|---|---:|---:|
| **Per minute** | 1 | **$0.0001144** (0.0114¢) |
| **Per song** | 3.0 | **$0.000343** (0.034¢) |
| **Per user / month** | 817 | **$0.0935** (9.3¢) |
| **Per user / year** | 9,800 | **$1.121** |

So a fully-active listener — someone who streams as much as the average Spotify
user — costs TollRoad about **$1.12/year, all-in, across the entire AWS stack.**

---

## Fixed / amortized AWS lines (not per-minute)

These don't scale with minutes; they amortize to ~$0 per stream but are listed
for completeness:

| Item | Cost | Per-stream impact |
|---|---|---|
| **S3 audio storage** | a 3-min song @ 160 kbps ≈ 3.6 MB × $0.023/GB-mo = **$0.00008 / song / mo** | divided across every stream of that song → negligible |
| **KMS CMK** | **$1 / mo** flat (one key, all catalog) | $0.00000012/min amortized (already in the table) |
| **Aurora DSQL / Lambda idle** | **$0** — both scale to zero | no standing charge |
| **Bedrock "explain my statement"** | ~1.5k in + 0.4k out tokens = **$0.0035 / call** | only when a user asks; ~+4% to a user's monthly cost if used once |

---

## Margin

At an illustrative listener price of **$0.01/min**:

| | Per minute | Per user / mo (817 min) |
|---|---:|---:|
| Listener pays | $0.01000 | $8.170 |
| All-in AWS cost | $0.0001144 | $0.0935 |
| **AWS as % of price** | **1.14%** | **1.14%** |

The infrastructure consumes ~1% of gross billed revenue. The remaining ~99% is
split between the **artist royalty** (the bulk — that's the product) and
**TollRoad's platform take**. Even on a thin platform take of, say, 10% of
billed minutes (~$0.001/min), AWS cost is **~11% of the take** → ~89% gross
margin on the platform layer, dominated by a single controllable line (egress).

---

## Cost levers (in order of impact)

1. **Bitrate** — egress is 89% of cost and scales linearly. 160 → 128 kbps ≈ −20% all-in; 96 kbps ≈ −40%. Quality tiers; default mobile lower.
2. **HLS segment length** — CloudFront requests are 9% of cost and scale with segment count. 6s → 10s segments ≈ −40% on the request line.
3. **Edge cache-hit ratio** — long TTLs on immutable audio keep S3 origin GETs and KMS calls near zero; popular catalog is served entirely from the edge.
4. **S3 Bucket Keys** — collapse per-object KMS requests ~99%, pinning KMS at the $1/mo key.
5. **Per-minute (not per-second) metering** — one DynamoDB write + one ledger row per minute, not 60. Keeps the entire data plane at ~2% instead of being a real line.

---

## Assumptions & caveats

- **Bitrate 160 kbps / 1.2 MB per minute** and **3.0 min average song** (consistent with 9,800 min/yr ÷ 3,278 songs ≈ 3 min). Both are direct linear scalars — adjust and every figure moves proportionally.
- **CloudFront, DynamoDB, Lambda, S3, KMS rates** pulled from official AWS pricing pages, us-east-1 on-demand.
- **Aurora DSQL DPU-per-minute is modeled, not measured** (~0.073 DPU/min). DPU consumption is workload-specific; validate against actual CloudWatch DPU metrics once the rollup runs. Even at 5× the assumed DPU, DSQL stays under 3% of all-in cost — the conclusion (databases ≈ free per stream) is robust.
- **Bedrock Haiku token rate ($1 in / $5 out per 1M)** is corroborated against published model pricing; confirm in-console before locking.
- Figures are **marginal** (cost of one more minute). Perpetual free tiers (1 TB CloudFront egress, 25 GB DynamoDB, 100K DSQL DPU, 1M Lambda req, etc.) make the **first slice of traffic effectively free** — at low volume the real bill rounds to the **$1/mo KMS key**.
