// Stateless session as a signed JWT — the SAME token the old Next.js
// lib/server/session.ts minted, so existing sessions stay valid across the
// re-platform. HS256 signed with TOLLROAD_SESSION_SECRET, verified with `jose`.
//
// On the API this token is presented as `Authorization: Bearer <jwt>` (or in the
// `tollroad_session` cookie via the front-end proxy). The API Gateway Lambda
// authorizer verifies it and resolves the account id (claim `sub`).
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE = "tollroad_session";
const ISSUER = "tollroad";
const AUDIENCE = "tollroad-web";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

const secretValue = process.env.TOLLROAD_SESSION_SECRET;
let secretKey: Uint8Array | undefined;
function key(): Uint8Array {
  if (!secretValue || secretValue.length < 32) {
    throw new Error("TOLLROAD_SESSION_SECRET must be a random string of at least 32 chars.");
  }
  if (!secretKey) secretKey = new TextEncoder().encode(secretValue);
  return secretKey;
}

export function sessionConfigured(): boolean {
  return Boolean(secretValue && secretValue.length >= 32);
}

export interface SessionClaims {
  /** accounts.user_id — the canonical account id. */
  sub: string;
  name: string;
}

export async function createSessionToken(account: { id: string; displayName: string }): Promise<string> {
  return new SignJWT({ name: account.displayName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(account.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
}

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

export const SESSION_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
