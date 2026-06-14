// Server-only: resolve the acting identity for a request to the canonical
// account id. Ported from sonar. Precedence:
//   1. A valid session cookie → the claimed account (authoritative; the client
//      cannot override it with a body field).
//   2. Otherwise → the client-supplied anonymous id, which must be an unclaimed
//      account (acting as a claimed account requires a session).
import { readSession } from "@/lib/server/session";
import { ensureAnonymousAccount, AccountClaimedError, isUuid } from "@/lib/server/accounts";
import { dsqlConfigured } from "@/lib/dsql";

export interface Identity {
  /** The canonical account id (accounts.user_id). */
  userId: string;
  displayName: string;
  /** Whether this came from a verified session (claimed account). */
  authed: boolean;
}

export class NoIdentityError extends Error {
  constructor() {
    super("no session and no valid anonymous id");
    this.name = "NoIdentityError";
  }
}

export interface ResolveOptions {
  /** When false, treat a validated anon id as opaque without a DSQL round-trip. */
  ensure?: boolean;
}

export async function resolveIdentity(
  req: Request,
  anonId: string | undefined,
  { ensure = true }: ResolveOptions = {},
): Promise<Identity> {
  const session = await readSession(req);
  if (session) return { userId: session.sub, displayName: session.name, authed: true };

  if (!isUuid(anonId)) throw new NoIdentityError();
  if (!ensure || !dsqlConfigured()) {
    return { userId: anonId, displayName: "you", authed: false };
  }
  const account = await ensureAnonymousAccount(anonId);
  return { userId: account.id, displayName: account.displayName, authed: false };
}

export { AccountClaimedError };

/** Map an identity-resolution error to an HTTP response, or null to rethrow. */
export function identityErrorResponse(err: unknown): Response | null {
  if (err instanceof NoIdentityError) {
    return Response.json({ error: "a session or valid anonId is required" }, { status: 400 });
  }
  if (err instanceof AccountClaimedError) {
    return Response.json({ error: "sign in to act as this account" }, { status: 401 });
  }
  return null;
}
