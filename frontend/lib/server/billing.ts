// Server-only: the listener wallet. Three jobs —
//   1. charge a metered minute against the prepaid balance (atomic + idempotent),
//   2. credit a balance from a funded top-up (idempotent per payment),
//   3. read a listener's balance + streaming history.
//
// The balance lives in listener_profiles.balance_cents; every charge also writes
// the append-only royalty_ledger (the same table the rollup Lambda feeds), so a
// listener's paid minutes ARE their play history. Idempotency keys mirror the
// rollup's convention exactly: '<user>#<track>#<minuteEpoch>'.
import { withDsql, query } from "@/lib/dsql";

/** Face value of one top-up. */
export const TOPUP_CENTS = 1000;

/** The card processing fee we pass on to the listener: Stripe's 2.9% + 30¢,
 *  rounded up to the cent. ACH (us_bank_account) has no surcharge. */
export function cardFeeCents(amountCents: number): number {
  return Math.ceil(amountCents * 0.029) + 30;
}

/** The wall-clock minute bucket — matches royalty_ledger.minute_epoch and the
 *  rollup Lambda (floor(epochSeconds / 60)). Charging by wall-clock minute means
 *  replays within the same minute for the same track dedupe to one charge. */
export function currentMinuteEpoch(): number {
  return Math.floor(Date.now() / 1000 / 60);
}

const SERIALIZATION_FAILURE = "40001"; // DSQL OCC conflict

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

export interface ChargeInput {
  accountId: string;
  trackId: string;
  artistId: string;
  amountCents: number;
  minuteEpoch?: number;
}
export type ChargeResult =
  | { ok: true; balanceCents: number; charged: boolean }
  | { ok: false; reason: "insufficient"; balanceCents: number };

/**
 * Deduct one metered minute, atomically and idempotently:
 *   - the ledger row (PK = idempotency key) is the dedup guard — a second charge
 *     for the same user+track+minute is a no-op that returns the live balance;
 *   - the deduct only commits together with a brand-new ledger row, so a balance
 *     is never debited twice for the same minute and never debited below zero.
 * Returns ok:false when the balance can't cover the minute (caller → HTTP 402).
 */
export async function chargeMinute(input: ChargeInput): Promise<ChargeResult> {
  const minuteEpoch = input.minuteEpoch ?? currentMinuteEpoch();
  const key = `${input.accountId}#${input.trackId}#${minuteEpoch}`;
  const amt = input.amountCents;

  return withRetry(() =>
    withDsql(async (db) => {
      try {
        await db.query("BEGIN");

        // Already billed this minute for this track → idempotent no-op.
        const dup = await db.query(
          `SELECT 1 FROM royalty_ledger WHERE idempotency_key = $1`,
          [key],
        );
        if (dup.rowCount) {
          const bal = await db.query<{ balance_cents: string }>(
            `SELECT balance_cents FROM listener_profiles WHERE account_id = $1`,
            [input.accountId],
          );
          await db.query("COMMIT");
          return { ok: true, balanceCents: Number(bal.rows[0]?.balance_cents ?? 0), charged: false };
        }

        // Conditional deduct — only succeeds if the balance covers the minute.
        const upd = await db.query<{ balance_cents: string }>(
          `UPDATE listener_profiles
              SET balance_cents = balance_cents - $2
            WHERE account_id = $1 AND balance_cents >= $2
            RETURNING balance_cents`,
          [input.accountId, amt],
        );
        if (!upd.rowCount) {
          await db.query("ROLLBACK");
          const bal = await query<{ balance_cents: string }>(
            `SELECT balance_cents FROM listener_profiles WHERE account_id = $1`,
            [input.accountId],
          );
          return { ok: false, reason: "insufficient", balanceCents: Number(bal.rows[0]?.balance_cents ?? 0) };
        }

        await db.query(
          `INSERT INTO royalty_ledger
             (idempotency_key, user_id, track_id, artist_id, minute_epoch, amount_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [key, input.accountId, input.trackId, input.artistId, minuteEpoch, amt],
        );
        await db.query("COMMIT");
        return { ok: true, balanceCents: Number(upd.rows[0].balance_cents), charged: true };
      } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }),
  );
}

/** True if (user, track) was billed within the last `windowSec` seconds — the
 *  proof-of-payment the stream route requires before it will decrypt a byte. */
export async function hasRecentCharge(
  accountId: string,
  trackId: string,
  windowSec = 150,
): Promise<boolean> {
  const minFrom = currentMinuteEpoch() - Math.ceil(windowSec / 60);
  const res = await query(
    `SELECT 1 FROM royalty_ledger
      WHERE user_id = $1 AND track_id = $2 AND minute_epoch >= $3 LIMIT 1`,
    [accountId, trackId, minFrom],
  );
  return Boolean(res.rowCount);
}

export interface CreditInput {
  accountId: string;
  paymentRef: string;
  amountCents: number;
  feeCents: number;
  method: "ach" | "card" | "demo";
  status: string;
}
export type CreditResult = { credited: boolean; balanceCents: number };

/**
 * Credit a funded top-up. Idempotent on the Stripe payment id: the wallet_topups
 * insert (PK = payment_ref) is the guard, so a replayed webhook/confirm credits
 * the balance exactly once.
 */
export async function creditTopup(input: CreditInput): Promise<CreditResult> {
  return withRetry(() =>
    withDsql(async (db) => {
      try {
        await db.query("BEGIN");
        const ins = await db.query(
          `INSERT INTO wallet_topups
             (payment_ref, account_id, amount_cents, fee_cents, method, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (payment_ref) DO NOTHING
           RETURNING payment_ref`,
          [input.paymentRef, input.accountId, input.amountCents, input.feeCents, input.method, input.status],
        );
        if (!ins.rowCount) {
          // Replay — already credited. Return the live balance unchanged.
          const bal = await db.query<{ balance_cents: string }>(
            `SELECT balance_cents FROM listener_profiles WHERE account_id = $1`,
            [input.accountId],
          );
          await db.query("COMMIT");
          return { credited: false, balanceCents: Number(bal.rows[0]?.balance_cents ?? 0) };
        }
        const upd = await db.query<{ balance_cents: string }>(
          `INSERT INTO listener_profiles (account_id, balance_cents)
             VALUES ($1, $2)
           ON CONFLICT (account_id)
             DO UPDATE SET balance_cents = listener_profiles.balance_cents + EXCLUDED.balance_cents
           RETURNING balance_cents`,
          [input.accountId, input.amountCents],
        );
        await db.query("COMMIT");
        return { credited: true, balanceCents: Number(upd.rows[0].balance_cents) };
      } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }),
  );
}

export async function getBalanceCents(accountId: string): Promise<number> {
  const res = await query<{ balance_cents: string }>(
    `SELECT balance_cents FROM listener_profiles WHERE account_id = $1`,
    [accountId],
  );
  return Number(res.rows[0]?.balance_cents ?? 0);
}

export interface HistoryRow {
  trackId: string;
  title: string;
  artistName: string;
  coverImageKey: string | null;
  minutes: number;
  amountCents: number;
  lastPlayedEpoch: number;
}

/** A listener's streaming history: their ledger rows folded per track (minutes
 *  paid, total spent, last played), newest first. */
export async function getListeningHistory(accountId: string, limit = 100): Promise<HistoryRow[]> {
  const res = await query<{
    track_id: string;
    title: string | null;
    artist_name: string | null;
    cover_image_key: string | null;
    minutes: string;
    amount_cents: string;
    last_epoch: string;
  }>(
    `SELECT l.track_id,
            t.title           AS title,
            a.name            AS artist_name,
            t.cover_image_key AS cover_image_key,
            COUNT(*)              AS minutes,
            SUM(l.amount_cents)  AS amount_cents,
            MAX(l.minute_epoch)  AS last_epoch
       FROM royalty_ledger l
       LEFT JOIN tracks  t ON t.id = l.track_id
       LEFT JOIN artists a ON a.id = l.artist_id
      WHERE l.user_id = $1
      GROUP BY l.track_id, t.title, a.name, t.cover_image_key
      ORDER BY last_epoch DESC
      LIMIT $2`,
    [accountId, limit],
  );
  return res.rows.map((r) => ({
    trackId: r.track_id,
    title: r.title ?? "Unknown track",
    artistName: r.artist_name ?? "Unknown artist",
    coverImageKey: r.cover_image_key,
    minutes: Number(r.minutes),
    amountCents: Number(r.amount_cents),
    lastPlayedEpoch: Number(r.last_epoch),
  }));
}
