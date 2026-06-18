// API Gateway REQUEST Lambda authorizer.
//
// Validates the session JWT (Authorization: Bearer, or the tollroad_session
// cookie) and resolves the account id, which it passes to downstream handlers in
// the authorizer context. API-key (usage-plan) routes are authorized separately
// by API Gateway itself, so this authorizer is only attached to user-scoped
// routes. The handlers ALSO verify the token defensively (see lib/http.ts), so
// the system is correct even where the authorizer isn't attached (local dev).
import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from "aws-lambda";
import { verifySessionToken, SESSION_COOKIE } from "../lib/jwt.ts";

interface AuthContext extends Record<string, string> {
  accountId: string;
  displayName: string;
}

function extractToken(headers: Record<string, string | undefined> | undefined): string | null {
  if (!headers) return null;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (v != null) lower[k.toLowerCase()] = v;

  const auth = lower["authorization"];
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();

  const cookie = lower["cookie"];
  if (cookie) {
    for (const part of cookie.split(";")) {
      const idx = part.indexOf("=");
      if (idx !== -1 && part.slice(0, idx).trim() === SESSION_COOKIE) return part.slice(idx + 1).trim();
    }
  }
  return null;
}

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext>> {
  const token = extractToken(event.headers);
  const claims = token ? await verifySessionToken(token) : null;
  if (!claims) {
    return { isAuthorized: false, context: { accountId: "", displayName: "" } };
  }
  return { isAuthorized: true, context: { accountId: claims.sub, displayName: claims.name } };
}
