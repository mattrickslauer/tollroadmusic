import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidRateMillicents,
  MAX_RATE_MILLICENTS,
  stripeCentsToMillicents,
  millicentsToStripeCents,
  chargeMinuteLocalDsql,
} from "./billing.ts";
import { dsqlConfigured, query } from "../lib/dsql.ts";

test("rate validation: accepts 0 (free), on-step values, and the cap", () => {
  assert.equal(isValidRateMillicents(0), true);
  assert.equal(isValidRateMillicents(500), true);          // 0.5¢/min
  assert.equal(isValidRateMillicents(MAX_RATE_MILLICENTS), true);
});
test("rate validation: rejects negative, over-cap, off-step, non-integer", () => {
  assert.equal(isValidRateMillicents(-100), false);
  assert.equal(isValidRateMillicents(MAX_RATE_MILLICENTS + 100), false);
  assert.equal(isValidRateMillicents(150), false);         // off 100-step
  assert.equal(isValidRateMillicents(50.5), false);
  assert.equal(isValidRateMillicents("100"), false);
});

test("stripeCentsToMillicents: 1000 cents → 1_000_000 millicents", () => {
  assert.equal(stripeCentsToMillicents(1000), 1_000_000);
});
test("millicentsToStripeCents: 1_000_000 millicents → 1000 cents", () => {
  assert.equal(millicentsToStripeCents(1_000_000), 1000);
});
test("millicentsToStripeCents: rounds sub-cent amounts up", () => {
  assert.equal(millicentsToStripeCents(1500), 2); // 1.5¢ → 2¢
  assert.equal(millicentsToStripeCents(1499), 1); // 1.499¢ → 1¢
});

// ---------------------------------------------------------------------------
// DSQL integration test — guarded by TOLLROAD_DSQL_ENDPOINT.
// Skips cleanly when the env var is absent (local / unit-only CI).
// To run: set TOLLROAD_DSQL_ENDPOINT, TOLLROAD_DSQL_REGION (default us-east-1),
// and AWS credentials with Aurora DSQL connect-admin permissions.
// Mechanism under test: `balance_millicents >= $amt` with $amt = 0 always
// satisfies the guard, so a 0-balance account can play a free (0-rate) track.
// ---------------------------------------------------------------------------
test(
  "free tier: 0-millicent charge succeeds at empty balance and writes ledger row",
  { skip: !dsqlConfigured() },
  async () => {
    // Use timestamp-suffixed IDs to avoid collisions across parallel runs.
    // Aurora DSQL has no FK constraints, so synthetic track/artist IDs are safe.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const accountId = `test-free-${suffix}`;
    const trackId   = `test-track-${suffix}`;
    const artistId  = `test-artist-${suffix}`;
    // Pin the minute so the idempotency key is stable for the cleanup query.
    const minuteEpoch = Math.floor(Date.now() / 1000 / 60);
    const idempotencyKey = `${accountId}#${trackId}#${minuteEpoch}`;

    // Seed: insert a listener_profiles row with balance 0.
    await query(
      `INSERT INTO listener_profiles (account_id, balance_millicents)
       VALUES ($1, 0)
       ON CONFLICT (account_id) DO UPDATE SET balance_millicents = 0`,
      [accountId],
    );

    try {
      const result = await chargeMinuteLocalDsql({
        accountId,
        trackId,
        artistId,
        amountMillicents: 0,
        minuteEpoch,
      });

      // --- core assertions ---
      if (!result.ok) {
        assert.fail(
          `chargeMinute returned ok:false for a free-tier track at empty balance — ` +
          `reason=${result.reason} balance=${result.balanceMillicents}`,
        );
      }
      assert.equal(result.balanceMillicents, 0,
        "balance must remain 0 after a free-tier play");
      assert.equal(result.charged, true,
        "charged must be true (not a duplicate replay)");

      // --- ledger assertion: royalty_ledger row must exist with amount 0 ---
      const ledger = await query<{ amount_millicents: string }>(
        `SELECT amount_millicents FROM royalty_ledger WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      assert.equal(ledger.rowCount, 1,
        "royalty_ledger must contain exactly one row for this (user, track, minute)");
      assert.equal(
        Number(ledger.rows[0]!.amount_millicents),
        0,
        "royalty_ledger.amount_millicents must be 0 — free plays count in stats at zero cost",
      );
    } finally {
      // Clean up seeded rows so reruns are idempotent.
      await query(`DELETE FROM royalty_ledger    WHERE idempotency_key = $1`, [idempotencyKey]).catch(() => {});
      await query(`DELETE FROM listener_profiles WHERE account_id      = $1`, [accountId]).catch(() => {});
    }
  },
);
