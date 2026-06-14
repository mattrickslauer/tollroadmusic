// Server-only: email one-time-passcodes, stored in DSQL (auth_otp). Ported from
// the sonar DynamoDB version; the security model is identical, the storage is
// DSQL so TollRoad needs no second datastore.
//
// SECURITY:
//   - Only a salted HASH of the code is stored, never plaintext. HMAC-SHA256
//     peppered with the session secret, compared in constant time.
//   - Codes are 6 random digits from crypto.randomInt, expire in 10 min, and
//     allow a small fixed number of guesses before the challenge is burned.
//   - The attempt cap is claimed atomically in SQL (UPDATE ... WHERE
//     attempts_left > 0 RETURNING) so concurrent guesses can't exceed it.
//   - Resends throttled to one per cooldown, capped per code lifetime.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { query } from "@/lib/dsql";

const TTL_SECONDS = 10 * 60; // codes live 10 minutes
const MAX_ATTEMPTS = 5; // guesses before the code is burned
const RESEND_COOLDOWN_MS = 30 * 1000; // min gap between sends to one email
const MAX_SENDS = 5; // sends per code lifetime

const pepper = process.env.TOLLROAD_SESSION_SECRET ?? "";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string): string {
  // Bind the hash to the email so a code is only valid for its address.
  return createHmac("sha256", pepper).update(`${email}:${code}`).digest("hex");
}

export type StartResult = { ok: true; code: string } | { ok: false; reason: "throttled" };

/**
 * Begin an OTP challenge: generate a code, store its hash with a TTL, and return
 * the plaintext to the caller (which emails it — the code never goes to the
 * client in a response body).
 */
export async function startOtp(emailRaw: string): Promise<StartResult> {
  const email = normalizeEmail(emailRaw);
  const now = Date.now();

  const existing = await query<{ sent_at: string; send_count: number }>(
    `SELECT sent_at, send_count FROM auth_otp WHERE email = $1`,
    [email],
  );
  const cur = existing.rows[0];
  if (cur) {
    if (now - Number(cur.sent_at) < RESEND_COOLDOWN_MS) return { ok: false, reason: "throttled" };
    if (Number(cur.send_count) >= MAX_SENDS) return { ok: false, reason: "throttled" };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await query(
    `INSERT INTO auth_otp (email, code_hash, attempts_left, sent_at, send_count, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       code_hash     = EXCLUDED.code_hash,
       attempts_left = EXCLUDED.attempts_left,
       sent_at       = EXCLUDED.sent_at,
       send_count    = auth_otp.send_count + 1,
       expires_at    = EXCLUDED.expires_at`,
    [email, hashCode(email, code), MAX_ATTEMPTS, now, Number(cur?.send_count ?? 0) + 1, now + TTL_SECONDS * 1000],
  );
  return { ok: true, code };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "expired" | "no_attempts" | "mismatch" };

/** Verify a submitted code. Burns the challenge on success. */
export async function verifyOtp(emailRaw: string, codeRaw: string): Promise<VerifyResult> {
  const email = normalizeEmail(emailRaw);
  const code = String(codeRaw).trim();
  const now = Date.now();

  // Atomically claim one attempt against a live, unexpired challenge.
  const claim = await query<{ attempts_left: number; code_hash: string }>(
    `UPDATE auth_otp
       SET attempts_left = attempts_left - 1
     WHERE email = $1 AND attempts_left > 0 AND expires_at > $2
     RETURNING attempts_left, code_hash`,
    [email, now],
  );
  const row = claim.rows[0];
  if (!row) {
    // No row, exhausted attempts, or expired — all indistinguishable to the caller.
    return { ok: false, reason: "no_attempts" };
  }

  const expected = Buffer.from(row.code_hash, "utf8");
  const got = Buffer.from(hashCode(email, code), "utf8");
  const matches = expected.length === got.length && timingSafeEqual(expected, got);

  if (!matches) {
    return { ok: false, reason: Number(row.attempts_left) > 0 ? "mismatch" : "no_attempts" };
  }

  // Success → burn the challenge so the code can't be reused.
  await query(`DELETE FROM auth_otp WHERE email = $1`, [email]).catch(() => {});
  return { ok: true };
}
