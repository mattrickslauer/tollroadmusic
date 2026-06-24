// The listener wallet — charge a metered minute, credit a top-up, read balance
// and history. Ported verbatim from the front-end's lib/server/billing.ts; only
// the DSQL import path changed. The balance lives in
// listener_profiles.balance_cents; every charge also writes the append-only
// royalty_ledger. Idempotency key: '<user>#<track>#<minuteEpoch>'.
import { withDsql, query } from "../lib/dsql.ts";

export const TOPUP_CENTS = 1000;

// The one-time welcome gift: $3.00 = 300 minutes of listening at the 1¢/min
// default rate. Granted once per account on first onboarding.
export const ONBOARDING_GIFT_CENTS = 300;

export function cardFeeCents(amountCents: number): number {
  return Math.ceil(amountCents * 0.029) + 30;
}

export function currentMinuteEpoch(): number {
  return Math.floor(Date.now() / 1000 / 60);
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

export async function chargeMinute(input: ChargeInput): Promise<ChargeResult> {
  const minuteEpoch = input.minuteEpoch ?? currentMinuteEpoch();
  const key = `${input.accountId}#${input.trackId}#${minuteEpoch}`;
  const amt = input.amountCents;

  return withRetry(() =>
    withDsql(async (db) => {
      try {
        await db.query("BEGIN");

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
        return { ok: true, balanceCents: Number(upd.rows[0]!.balance_cents), charged: true };
      } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }),
  );
}

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
        return { credited: true, balanceCents: Number(upd.rows[0]!.balance_cents) };
      } catch (err) {
        await db.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }),
  );
}

export type GiftResult = { credited: boolean; balanceCents: number };

/** Credit the one-time onboarding gift exactly once per account. Idempotent on
 *  listener_profiles.onboarding_gift_claimed_at: the first call credits and
 *  stamps the column; any replay returns credited:false with the live balance. */
export async function creditOnboardingGift(accountId: string): Promise<GiftResult> {
  return withRetry(() =>
    withDsql(async (db) => {
      try {
        await db.query("BEGIN");
        // Upsert so a missing profile row is still handled; the conditional
        // DO UPDATE only fires (and only RETURNs a row) when unclaimed.
        const upd = await db.query<{ balance_cents: string }>(
          `INSERT INTO listener_profiles (account_id, balance_cents, onboarding_gift_claimed_at)
             VALUES ($1, $2, now())
           ON CONFLICT (account_id) DO UPDATE
             SET balance_cents = listener_profiles.balance_cents + EXCLUDED.balance_cents,
                 onboarding_gift_claimed_at = now()
             WHERE listener_profiles.onboarding_gift_claimed_at IS NULL
           RETURNING balance_cents`,
          [accountId, ONBOARDING_GIFT_CENTS],
        );
        if (upd.rowCount) {
          await db.query("COMMIT");
          return { credited: true, balanceCents: Number(upd.rows[0]!.balance_cents) };
        }
        // Already claimed — no credit, return the current balance.
        const bal = await db.query<{ balance_cents: string }>(
          `SELECT balance_cents FROM listener_profiles WHERE account_id = $1`,
          [accountId],
        );
        await db.query("COMMIT");
        return { credited: false, balanceCents: Number(bal.rows[0]?.balance_cents ?? 0) };
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
  artistId: string;
  coverImageKey: string | null;
  minutes: number;
  amountCents: number;
  lastPlayedEpoch: number;
}

export async function getListeningHistory(accountId: string, limit = 100): Promise<HistoryRow[]> {
  const res = await query<{
    track_id: string;
    title: string | null;
    artist_name: string | null;
    artist_id: string | null;
    cover_image_key: string | null;
    minutes: string;
    amount_cents: string;
    last_epoch: string;
  }>(
    `SELECT l.track_id,
            t.title           AS title,
            a.name            AS artist_name,
            l.artist_id       AS artist_id,
            t.cover_image_key AS cover_image_key,
            COUNT(*)              AS minutes,
            SUM(l.amount_cents)  AS amount_cents,
            MAX(l.minute_epoch)  AS last_epoch
       FROM royalty_ledger l
       LEFT JOIN tracks  t ON t.id = l.track_id
       LEFT JOIN artists a ON a.id = l.artist_id
      WHERE l.user_id = $1
      GROUP BY l.track_id, t.title, a.name, l.artist_id, t.cover_image_key
      ORDER BY last_epoch DESC
      LIMIT $2`,
    [accountId, limit],
  );
  return res.rows.map((r) => ({
    trackId: r.track_id,
    title: r.title ?? "Unknown track",
    artistName: r.artist_name ?? "Unknown artist",
    artistId: r.artist_id ?? "",
    coverImageKey: r.cover_image_key,
    minutes: Number(r.minutes),
    amountCents: Number(r.amount_cents),
    lastPlayedEpoch: Number(r.last_epoch),
  }));
}
