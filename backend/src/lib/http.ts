// A tiny, framework-free request/response shape shared by every handler, plus
// adapters so the same handler runs (a) behind API Gateway as a Lambda and
// (b) under the local dev server (src/local-server.ts) — and so the front-end
// and third-party consumers hit an identical contract.
import { verifySessionToken, SESSION_COOKIE, type SessionClaims } from "./jwt.ts";

export interface ApiRequest {
  method: string;
  /** Path params, e.g. { trackId } from /v1/stream/{trackId}. */
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>; // lower-cased keys
  /** Parsed JSON body, or null. */
  body: unknown;
  /** Raw body bytes (needed for Stripe webhook signature verification). */
  rawBody: string;
  /** API key id when the caller authenticated via a usage-plan key. */
  apiKeyId?: string;
}

export interface ApiResponse {
  status: number;
  /** JSON body (serialized) — omit for `raw`. */
  body?: unknown;
  /** Raw (already-serialized) body for non-JSON responses (e.g. audio). */
  raw?: { contentType: string; data: Buffer | string; base64?: boolean };
  headers?: Record<string, string>;
  /** Set-Cookie values. */
  cookies?: string[];
}

export type Handler = (req: ApiRequest) => Promise<ApiResponse>;

export function json(status: number, body: unknown, headers?: Record<string, string>): ApiResponse {
  return { status, body, headers };
}
export function ok(body: unknown, headers?: Record<string, string>): ApiResponse {
  return json(200, body, headers);
}
export function error(status: number, message: string, extra?: Record<string, unknown>): ApiResponse {
  return json(status, { error: message, ...extra });
}
/** Decrypted/per-listener responses must never be cached anywhere. */
export const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export function header(req: ApiRequest, name: string): string | undefined {
  return req.headers[name.toLowerCase()];
}

export function bearerToken(req: ApiRequest): string | null {
  const auth = header(req, "authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  // Fall back to the session cookie (front-end proxy path).
  const cookie = header(req, "cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const idx = part.indexOf("=");
      if (idx !== -1 && part.slice(0, idx).trim() === SESSION_COOKIE) {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

/** Resolve the verified session, or null. */
export async function getSession(req: ApiRequest): Promise<SessionClaims | null> {
  const token = bearerToken(req);
  if (!token) return null;
  return verifySessionToken(token);
}

export class HttpError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
  toResponse(): ApiResponse {
    return error(this.status, this.message, this.extra);
  }
}

/** Require a signed-in account; throws 401 otherwise. */
export async function requireSession(req: ApiRequest): Promise<SessionClaims> {
  const s = await getSession(req);
  if (!s) throw new HttpError(401, "sign in to continue");
  return s;
}
