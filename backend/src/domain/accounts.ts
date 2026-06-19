// Durable account records in Aurora DSQL — the system-of-record for identity.
// Ported verbatim from the front-end's lib/server/accounts.ts; only the DSQL
// import path changed. Account-with-profiles model: one account can hold an
// artist profile (a row in `artists`) and a listener profile (a row in
// `listener_profiles`).
import { randomUUID } from "node:crypto";
import { query } from "../lib/dsql.ts";

export interface Account {
  id: string;
  handle: string | null;
  displayName: string;
  email: string | null;
  authMethod: string | null;
  claimedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ArtistProfile {
  id: string;
  name: string;
  genre: string | null;
}
export interface ListenerProfile {
  balanceCents: number;
  /** Whether the one-time onboarding welcome gift has been claimed. */
  onboardingGiftClaimed: boolean;
}
export interface Profiles {
  artist: ArtistProfile | null;
  listener: ListenerProfile | null;
}

export class AccountClaimedError extends Error {
  constructor() {
    super("account is claimed; sign in to act as it");
    this.name = "AccountClaimedError";
  }
}

const UNIQUE_VIOLATION = "23505";
const SERIALIZATION_FAILURE = "40001"; // DSQL OCC conflict

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}
export function newAccountId(): string {
  return randomUUID();
}

const SELECT_COLS = `
  user_id AS id, handle, COALESCE(display_name, 'you') AS "displayName",
  email, auth_method AS "authMethod", claimed_at AS "claimedAt",
  last_login_at AS "lastLoginAt", created_at AS "createdAt"
`;

async function fetchOne(where: string, params: unknown[]): Promise<Account | null> {
  const res = await query<Account>(`SELECT ${SELECT_COLS} FROM accounts WHERE ${where} LIMIT 1`, params);
  return res.rows[0] ?? null;
}
export function getAccountById(id: string): Promise<Account | null> {
  return fetchOne("user_id = $1", [id]);
}
export function getAccountByEmail(email: string): Promise<Account | null> {
  return fetchOne("email = $1", [email.toLowerCase()]);
}
export function getAccountByHandle(handle: string): Promise<Account | null> {
  return fetchOne("handle = $1", [handle]);
}

/** Record who referred a freshly-created account. Resolves the referrer's handle
 *  → account; no-op if unknown, self, or already set. Attribution only. */
export async function recordReferral(newAccountId: string, referrerHandle: string): Promise<void> {
  const ref = referrerHandle.trim();
  if (!ref) return;
  const referrer = await getAccountByHandle(ref);
  if (!referrer || referrer.id === newAccountId) return;
  await query(`UPDATE accounts SET referred_by = $2 WHERE user_id = $1 AND referred_by IS NULL`, [
    newAccountId,
    referrer.id,
  ]).catch(() => {});
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
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

export async function ensureAnonymousAccount(id: string): Promise<Account> {
  if (!isUuid(id)) throw new Error("invalid account id");
  return withRetry(async () => {
    await query(
      `INSERT INTO accounts (user_id, handle, display_name)
       VALUES ($1, $2, 'you') ON CONFLICT (user_id) DO NOTHING`,
      [id, id],
    );
    const account = await getAccountById(id);
    if (!account) throw new Error("account row vanished after insert");
    if (account.claimedAt) throw new AccountClaimedError();
    return account;
  });
}

export interface ClaimIdentity {
  email: string;
  displayName?: string;
  authMethod: "email_otp";
}
export interface ClaimResult {
  account: Account;
  claimed: boolean;
}

export async function claimOrSignIn(
  deviceAccountId: string,
  identity: ClaimIdentity,
): Promise<ClaimResult> {
  const email = identity.email.toLowerCase();
  const { authMethod } = identity;

  return withRetry(async () => {
    const existing = await getAccountByEmail(email);
    if (existing) {
      await query(`UPDATE accounts SET last_login_at = now() WHERE user_id = $1`, [existing.id]);
      return { account: (await getAccountById(existing.id))!, claimed: false };
    }

    const displayName = identity.displayName?.trim() || email.split("@")[0] || "you";
    let targetId = deviceAccountId;
    const device = isUuid(deviceAccountId) ? await getAccountById(deviceAccountId) : null;
    if (!device || device.claimedAt) {
      targetId = newAccountId();
      await query(`INSERT INTO accounts (user_id, handle, display_name) VALUES ($1, $2, $3)`, [
        targetId,
        targetId,
        displayName,
      ]);
    }

    try {
      const upd = await query<Account>(
        `UPDATE accounts
            SET email = $2, auth_method = $3, display_name = $4,
                claimed_at = now(), last_login_at = now()
          WHERE user_id = $1 AND claimed_at IS NULL
          RETURNING ${SELECT_COLS}`,
        [targetId, email, authMethod, displayName],
      );
      if (upd.rows[0]) return { account: upd.rows[0], claimed: true };
    } catch (err) {
      if ((err as { code?: string })?.code !== UNIQUE_VIOLATION) throw err;
    }

    const winner = await getAccountByEmail(email);
    if (!winner) throw new Error("claim failed and no existing account found");
    return { account: winner, claimed: false };
  });
}

// --- Profiles --------------------------------------------------------------

export async function ensureListenerProfile(accountId: string): Promise<void> {
  await query(
    `INSERT INTO listener_profiles (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING`,
    [accountId],
  );
}

export async function getProfiles(accountId: string): Promise<Profiles> {
  const [artistR, listenerR] = await Promise.all([
    query<ArtistProfile>(`SELECT id, name, genre FROM artists WHERE account_id = $1 LIMIT 1`, [accountId]),
    query<{ balanceCents: number; giftClaimed: boolean }>(
      `SELECT balance_cents AS "balanceCents",
              (onboarding_gift_claimed_at IS NOT NULL) AS "giftClaimed"
         FROM listener_profiles WHERE account_id = $1 LIMIT 1`,
      [accountId],
    ),
  ]);
  return {
    artist: artistR.rows[0] ?? null,
    listener: listenerR.rows[0]
      ? {
          balanceCents: Number(listenerR.rows[0].balanceCents),
          onboardingGiftClaimed: Boolean(listenerR.rows[0].giftClaimed),
        }
      : null,
  };
}

export async function createArtistProfile(
  accountId: string,
  fields: { name: string; email: string | null; genre: string | null; location: string | null; website: string | null; bio: string | null },
): Promise<ArtistProfile> {
  const existing = await query<ArtistProfile>(
    `SELECT id, name, genre FROM artists WHERE account_id = $1 LIMIT 1`,
    [accountId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const id = randomUUID();
  const res = await query<ArtistProfile>(
    `INSERT INTO artists (id, account_id, name, email, genre, location, website, bio)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, genre`,
    [id, accountId, fields.name, fields.email, fields.genre, fields.location, fields.website, fields.bio],
  );
  return res.rows[0]!;
}
