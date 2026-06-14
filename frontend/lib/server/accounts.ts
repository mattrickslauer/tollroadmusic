// Server-only: durable account records in Aurora DSQL — the system-of-record
// for identity. Ported from sonar, email-OTP only, adapted to TollRoad's
// `accounts` table (PK is user_id, aliased here as `id`) and the
// account-with-profiles model: one account can hold BOTH an artist profile
// (a row in `artists`) and a listener profile (a row in `listener_profiles`).
//
// Identity lifecycle: an anonymous device is an `accounts` row with
// claimed_at = null (id generated client-side). "Claiming" upgrades that row in
// place — set email/claimed_at — so the id never changes and all existing
// activity (balance, plays) stays attached with zero migration.
import { randomUUID } from "node:crypto";
import { query } from "@/lib/dsql";

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
}
export interface Profiles {
  artist: ArtistProfile | null;
  listener: ListenerProfile | null;
}

/** Raised when an unauthenticated caller supplies the id of an already-claimed
 *  account. A claimed account may only be acted as via its session. */
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

/** Retry a unit of work on DSQL optimistic-concurrency conflicts (40001). */
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

/**
 * Ensure an anonymous account row exists for a client-generated id, creating an
 * unclaimed one on first write. Idempotent. Rejects ids that already belong to a
 * CLAIMED account (those require a session, not a guessable id).
 */
export async function ensureAnonymousAccount(id: string): Promise<Account> {
  if (!isUuid(id)) throw new Error("invalid account id");
  return withRetry(async () => {
    // $1 (uuid user_id) and $2 (text handle) must be distinct placeholders even
    // though both carry `id`: DSQL deduces one type per placeholder, and a
    // single $1 spanning a uuid and a text column fails with 42P08.
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
  /** true if this created/upgraded an account (first claim); false on sign-in. */
  claimed: boolean;
}

/**
 * Resolve a verified email sign-in into an account, binding it to the caller's
 * anonymous device row on a first claim. Existing email → sign in; new email →
 * upgrade the device's anon row in place, else create a fresh account. A unique
 * violation (two devices, one email) collapses to the sign-in path.
 */
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
      // Claimed underneath us → fall through to sign into the existing account.
    } catch (err) {
      if ((err as { code?: string })?.code !== UNIQUE_VIOLATION) throw err;
    }

    const winner = await getAccountByEmail(email);
    if (!winner) throw new Error("claim failed and no existing account found");
    return { account: winner, claimed: false };
  });
}

// --- Profiles --------------------------------------------------------------

/** Create the listener profile (prepaid balance) if absent. Everyone who signs
 *  in gets one — listening is the default capability. */
export async function ensureListenerProfile(accountId: string): Promise<void> {
  await query(
    `INSERT INTO listener_profiles (account_id) VALUES ($1) ON CONFLICT (account_id) DO NOTHING`,
    [accountId],
  );
}

/** The artist + listener profiles attached to an account (either may be null). */
export async function getProfiles(accountId: string): Promise<Profiles> {
  const [artistR, listenerR] = await Promise.all([
    query<ArtistProfile>(`SELECT id, name, genre FROM artists WHERE account_id = $1 LIMIT 1`, [accountId]),
    query<{ balanceCents: number }>(
      `SELECT balance_cents AS "balanceCents" FROM listener_profiles WHERE account_id = $1 LIMIT 1`,
      [accountId],
    ),
  ]);
  return {
    artist: artistR.rows[0] ?? null,
    listener: listenerR.rows[0] ? { balanceCents: Number(listenerR.rows[0].balanceCents) } : null,
  };
}

/** Attach an artist profile to an account (one per account). Returns it, or the
 *  existing one if the account already has a profile. */
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
  return res.rows[0];
}
