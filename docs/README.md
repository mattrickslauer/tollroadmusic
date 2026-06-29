# TollRoad — Documentation

System architecture lives in the [root README](../README.md). This folder holds the
deeper references.

## Contents

- **[`data-model.md`](data-model.md)** — the canonical data model: DynamoDB item shapes
  (balance, METER / TOPUP events, DJ vectors + sessions) and the full Aurora DSQL DDL
  (catalog, accounts, library, `royalty_ledger`, summaries, payouts, mood). All in
  **millicents**. Mirrors [`infra/scripts/migrate-dsql.mjs`](../infra/scripts/migrate-dsql.mjs)
  + [`backend/scripts/migrate-mood.mjs`](../backend/scripts/migrate-mood.mjs).

- **[`decisions/`](decisions)** — architecture decision records.
  - [`2026-06-25-polyglot-cqrs-design.md`](decisions/2026-06-25-polyglot-cqrs-design.md) —
    the polyglot-CQRS migration (DynamoDB command path → projector → DSQL read model),
    the consistency rules, and the fast-follow roadmap (signed-heartbeat meter, API-key provider).
  - [`2026-06-25-creator-variable-rates.md`](decisions/2026-06-25-creator-variable-rates.md) —
    creator-set per-track rates (free → $1/min) and the cents → **millicents** migration
    ([design spec](superpowers/specs/2026-06-25-creator-variable-rates-design.md)).
  - [`2026-06-23-artist-content-profiles-design.md`](decisions/2026-06-23-artist-content-profiles-design.md)
    and its [plan](decisions/2026-06-23-artist-content-profiles.md) — artist content & profiles.

- **[`superpowers/specs/`](superpowers/specs)** — feature design specs:
  superfan bond, public share pages, agentic Vibe DJ, Vibe-Pad mood game, artist
  payouts + song CRUD, and the mobile dashboard / landing reinventions.
  Implementation plans live in [`superpowers/plans/`](superpowers/plans).

- **[`runbooks/`](runbooks)** and **[`demo/`](demo)** — the deploy runbook and the
  current demo script.

- **[`cost/`](cost)** — unit economics and the production cost model.
  - [`COST_ESTIMATE.md`](cost/COST_ESTIMATE.md) — hand-built cost breakdown (+ PDF / visual PDF).
  - [`aws-workload-model-10k.md`](cost/aws-workload-model-10k.md) — a machine-checked
    AWS pricing-calculator model for a 10k-user workload (with the `.usage.json` input).
