import { test } from "node:test";
import assert from "node:assert/strict";
import { payableCents } from "./payouts.ts";
import { dsqlConfigured, query } from "../lib/dsql.ts";
import {
  getEarnedMillicents,
  getAvailableMillicents,
  reserveWithdrawal,
  markWithdrawalPaid,
  markWithdrawalFailed,
} from "./payouts.ts";

test("payableCents floors millicents to whole cents", () => {
  assert.equal(payableCents(1_000_000), 1000); // $10.00 → 1000¢
  assert.equal(payableCents(1500), 1);          // 1.5¢ → 1¢ (floor, not round)
  assert.equal(payableCents(1499), 1);          // 1.499¢ → 1¢
  assert.equal(payableCents(999), 0);           // 0.999¢ → 0¢
});

test("payableCents is never negative", () => {
  assert.equal(payableCents(0), 0);
  assert.equal(payableCents(-5000), 0);
});

test(
  "reserveWithdrawal reserves earned balance once; second reserve sees it gone",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `00000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const userId = artistId; // synthetic; DSQL has no FKs
    const trackId = artistId;
    const minuteEpoch = Math.floor(Date.now() / 1000 / 60);
    const ledgerKey = `payout-test-${suffix}`;

    // Seed: one ledger row worth $5.00 (500_000 millicents) for this artist.
    await query(
      `INSERT INTO royalty_ledger
         (idempotency_key, user_id, track_id, artist_id, minute_epoch, amount_millicents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ledgerKey, userId, trackId, artistId, minuteEpoch, 500_000],
    );

    try {
      assert.equal(await getEarnedMillicents(artistId), 500_000);
      assert.equal(await getAvailableMillicents(artistId), 500_000);

      const first = await reserveWithdrawal(artistId);
      assert.ok(first.ok, "first reserve should succeed");
      if (first.ok) {
        assert.equal(first.payableCents, 500); // $5.00
        // Reserved (status 'pending') so available is now 0.
        assert.equal(await getAvailableMillicents(artistId), 0);

        const second = await reserveWithdrawal(artistId);
        assert.equal(second.ok, false); // nothing left to withdraw

        // Mark the reservation paid, then verify it stays counted.
        await markWithdrawalPaid(first.payoutId, "tr_test_123");
        assert.equal(await getAvailableMillicents(artistId), 0);
      }
    } finally {
      await query(`DELETE FROM payout_transfers WHERE artist_id = $1`, [artistId]).catch(() => {});
      await query(`DELETE FROM royalty_ledger WHERE idempotency_key = $1`, [ledgerKey]).catch(() => {});
    }
  },
);

test(
  "markWithdrawalFailed releases the reservation back to available",
  { skip: !dsqlConfigured() },
  async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artistId = `10000000-0000-4000-8000-${suffix.replace(/[^0-9a-f]/g, "0").slice(0, 12).padEnd(12, "0")}`;
    const ledgerKey = `payout-test-fail-${suffix}`;
    const minuteEpoch = Math.floor(Date.now() / 1000 / 60);
    await query(
      `INSERT INTO royalty_ledger
         (idempotency_key, user_id, track_id, artist_id, minute_epoch, amount_millicents)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ledgerKey, artistId, artistId, artistId, minuteEpoch, 300_000],
    );
    try {
      const r = await reserveWithdrawal(artistId);
      assert.ok(r.ok);
      if (r.ok) {
        assert.equal(await getAvailableMillicents(artistId), 0);
        await markWithdrawalFailed(r.payoutId);
        assert.equal(await getAvailableMillicents(artistId), 300_000); // released
      }
    } finally {
      await query(`DELETE FROM payout_transfers WHERE artist_id = $1`, [artistId]).catch(() => {});
      await query(`DELETE FROM royalty_ledger WHERE idempotency_key = $1`, [ledgerKey]).catch(() => {});
    }
  },
);
