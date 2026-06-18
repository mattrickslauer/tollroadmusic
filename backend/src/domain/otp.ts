// Email one-time-passcodes, stored in DSQL (auth_otp). Ported verbatim from the
// front-end's lib/server/otp.ts. Only a salted HMAC-SHA256 hash of the code is
// stored; codes are 6 random digits, expire in 10 min, attempt-capped atomically.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { query } from "../lib/dsql.ts";

const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SENDS = 5;

const pepper = process.env.TOLLROAD_SESSION_SECRET ?? "";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string): string {
  return createHmac("sha256", pepper).update(`${email}:${code}`).digest("hex");
}

export type StartResult = { ok: true; code: string } | { ok: false; reason: "throttled" };

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

export async function verifyOtp(emailRaw: string, codeRaw: string): Promise<VerifyResult> {
  const email = normalizeEmail(emailRaw);
  const code = String(codeRaw).trim();
  const now = Date.now();

  const claim = await query<{ attempts_left: number; code_hash: string }>(
    `UPDATE auth_otp
       SET attempts_left = attempts_left - 1
     WHERE email = $1 AND attempts_left > 0 AND expires_at > $2
     RETURNING attempts_left, code_hash`,
    [email, now],
  );
  const row = claim.rows[0];
  if (!row) return { ok: false, reason: "no_attempts" };

  const expected = Buffer.from(row.code_hash, "utf8");
  const got = Buffer.from(hashCode(email, code), "utf8");
  const matches = expected.length === got.length && timingSafeEqual(expected, got);

  if (!matches) {
    return { ok: false, reason: Number(row.attempts_left) > 0 ? "mismatch" : "no_attempts" };
  }

  await query(`DELETE FROM auth_otp WHERE email = $1`, [email]).catch(() => {});
  return { ok: true };
}
