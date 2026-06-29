// Artist payouts — Stripe Connect Express. Pure money math here; DSQL ledger ops
// (reserve/mark) added in the next task. Earnings come from royalty_ledger; the
// payout_transfers table records withdrawals. available = earned − non-failed payouts.

import { randomUUID } from "node:crypto";
import { query, withDsql } from "../lib/dsql.ts";

/** Whole cents payable for a given available balance, floored so we never
 *  transfer more than the artist has earned. The sub-cent remainder stays in the
 *  artist's available balance for next time. */
export function payableCents(availableMillicents: number): number {
  if (availableMillicents <= 0) return 0;
  return Math.floor(availableMillicents / 1000);
}

export interface PayoutRow {
  id: string;
  amountMillicents: number;
  status: string;
  createdAt: string;
}

const SERIALIZATION_FAILURE = "40001";
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if ((err as { code?: string })?.code === SERIALIZATION_FAILURE) continue;
      throw err;
    }
  }
  throw lastErr;
}

export async function getEarnedMillicents(artistId: string): Promise<number> {
  const r = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_millicents), 0) AS total
       FROM royalty_ledger WHERE artist_id = $1`,
    [artistId],
  );
  return Number(r.rows[0]?.total ?? 0);
}

async function reservedMillicents(artistId: string): Promise<number> {
  const r = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_millicents), 0) AS total
       FROM payout_transfers WHERE artist_id = $1 AND status <> 'failed'`,
    [artistId],
  );
  return Number(r.rows[0]?.total ?? 0);
}

export async function getAvailableMillicents(artistId: string): Promise<number> {
  const [earned, reserved] = [await getEarnedMillicents(artistId), await reservedMillicents(artistId)];
  return Math.max(0, earned - reserved);
}

/** Atomically reserve the full available balance as a 'pending' payout row, so
 *  concurrent withdraws can't both pass the balance check. The transfer happens
 *  AFTER this commits (in the handler); markWithdrawalPaid/Failed finalize it. */
export async function reserveWithdrawal(
  artistId: string,
): Promise<{ ok: true; payoutId: string; payableCents: number } | { ok: false; reason: "empty" }> {
  return withRetry(() =>
    withDsql(async (db) => {
      try {
        await db.query("BEGIN");
        const earnedR = await db.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount_millicents),0) AS total FROM royalty_ledger WHERE artist_id = $1`,
          [artistId],
        );
        const reservedR = await db.query<{ total: string }>(
          `SELECT COALESCE(SUM(amount_millicents),0) AS total
             FROM payout_transfers WHERE artist_id = $1 AND status <> 'failed'`,
          [artistId],
        );
        const available = Number(earnedR.rows[0]!.total) - Number(reservedR.rows[0]!.total);
        const cents = available > 0 ? Math.floor(available / 1000) : 0;
        if (cents <= 0) {
          await db.query("ROLLBACK");
          return { ok: false, reason: "empty" as const };
        }
        const id = randomUUID();
        await db.query(
          `INSERT INTO payout_transfers (id, artist_id, amount_millicents, status)
             VALUES ($1, $2, $3, 'pending')`,
          [id, artistId, cents * 1000],
        );
        await db.query("COMMIT");
        return { ok: true as const, payoutId: id, payableCents: cents };
      } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }),
  );
}

export async function markWithdrawalPaid(payoutId: string, transferId: string): Promise<void> {
  await query(
    `UPDATE payout_transfers SET status = 'paid', stripe_transfer_id = $2 WHERE id = $1`,
    [payoutId, transferId],
  );
}

export async function markWithdrawalFailed(payoutId: string): Promise<void> {
  await query(`UPDATE payout_transfers SET status = 'failed' WHERE id = $1`, [payoutId]);
}

export async function getArtistPayoutInfo(
  artistId: string,
): Promise<{ stripeAccountId: string | null; payoutsEnabled: boolean }> {
  const r = await query<{ stripe_account_id: string | null; payouts_enabled: boolean | null }>(
    `SELECT stripe_account_id, payouts_enabled FROM artists WHERE id = $1`,
    [artistId],
  );
  return {
    stripeAccountId: r.rows[0]?.stripe_account_id ?? null,
    payoutsEnabled: Boolean(r.rows[0]?.payouts_enabled),
  };
}

export async function setConnectAccount(artistId: string, acctId: string): Promise<void> {
  await query(`UPDATE artists SET stripe_account_id = $2 WHERE id = $1`, [artistId, acctId]);
}

export async function setPayoutsEnabled(artistId: string, enabled: boolean): Promise<void> {
  await query(`UPDATE artists SET payouts_enabled = $2 WHERE id = $1`, [artistId, enabled]);
}

export async function listPayouts(artistId: string): Promise<PayoutRow[]> {
  const r = await query<{ id: string; amount_millicents: string; status: string; created_at: string }>(
    `SELECT id, amount_millicents, status, created_at
       FROM payout_transfers WHERE artist_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [artistId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    amountMillicents: Number(row.amount_millicents),
    status: row.status,
    createdAt: row.created_at,
  }));
}
