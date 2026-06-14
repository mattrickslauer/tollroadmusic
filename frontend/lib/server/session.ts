// Server-only: stateless session as a signed JWT in an httpOnly cookie. The
// token IS the session — no session table. Ported from the sonar auth.
//
// SECURITY:
//   - HS256 signed with TOLLROAD_SESSION_SECRET (≥ 32 bytes of entropy),
//     verified with `jose` (audited) — we never hand-roll crypto.
//   - Cookie is httpOnly (XSS can't read it), Secure in production, SameSite=Lax
//     (browser omits it on cross-site POSTs → state-changing routes are CSRF-safe).
//   - The token carries only the account id + display name.
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE = "tollroad_session";
const ISSUER = "tollroad";
const AUDIENCE = "tollroad-web";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

const secretValue = process.env.TOLLROAD_SESSION_SECRET;
let secretKey: Uint8Array | undefined;
function key(): Uint8Array {
  if (!secretValue || secretValue.length < 32) {
    throw new Error(
      "TOLLROAD_SESSION_SECRET must be set to a random string of at least 32 chars.",
    );
  }
  if (!secretKey) secretKey = new TextEncoder().encode(secretValue);
  return secretKey;
}

/** True when sessions are configured (secret present). */
export function sessionConfigured(): boolean {
  return Boolean(secretValue && secretValue.length >= 32);
}

export interface SessionClaims {
  /** accounts.user_id — the canonical account id. */
  sub: string;
  name: string;
}

/** Mint a signed session token for an account. */
export async function createSessionToken(account: {
  id: string;
  displayName: string;
}): Promise<string> {
  return new SignJWT({ name: account.displayName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(account.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
}

/** Verify a session token; returns its claims or null if invalid/expired. */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: ISSUER, audience: AUDIENCE });
    const p = payload as JWTPayload & { name?: unknown };
    if (typeof p.sub !== "string" || typeof p.name !== "string") return null;
    return { sub: p.sub, name: p.name };
  } catch {
    return null;
  }
}

/** Read + verify the session from a request's Cookie header. */
export async function readSession(req: Request): Promise<SessionClaims | null> {
  const token = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  return verifySessionToken(token);
}

/** Set-Cookie value that installs the session. */
export function sessionCookie(token: string): string {
  return cookie(SESSION_COOKIE, token, MAX_AGE_SECONDS);
}

/** Set-Cookie value that clears the session (logout). */
export function clearSessionCookie(): string {
  return cookie(SESSION_COOKIE, "", 0);
}

function cookie(name: string, value: string, maxAge: number): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
