# TollRoad — Documentation

System architecture lives in the [root README](../README.md). This folder holds the
deeper references.

## Contents

- **[`data-model.md`](data-model.md)** — the canonical data model: DynamoDB item shapes
  (balance, METER / TOPUP events) and the Aurora DSQL DDL (catalog, accounts,
  `royalty_ledger`, summaries, reconciliation balance). Mirrors
  [`infra/scripts/migrate-dsql.mjs`](../infra/scripts/migrate-dsql.mjs).

- **[`decisions/`](decisions)** — design specs & decision records.
  - [`2026-06-25-polyglot-cqrs-design.md`](decisions/2026-06-25-polyglot-cqrs-design.md) —
    the polyglot-CQRS migration (DynamoDB command path → projector → DSQL read model),
    the consistency rules, and the fast-follow roadmap (signed-heartbeat meter, API-key provider).
  - [`2026-06-23-artist-content-profiles-design.md`](decisions/2026-06-23-artist-content-profiles-design.md)
    and its [plan](decisions/2026-06-23-artist-content-profiles.md) — artist content & profiles.

- **[`cost/`](cost)** — unit economics and the production cost model.
  - [`COST_ESTIMATE.md`](cost/COST_ESTIMATE.md) — hand-built cost breakdown (+ PDF / visual PDF).
  - [`aws-workload-model-10k.md`](cost/aws-workload-model-10k.md) — a machine-checked
    AWS pricing-calculator model for a 10k-user workload (with the `.usage.json` input).
