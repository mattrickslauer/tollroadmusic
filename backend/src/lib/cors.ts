// CORS headers. The front-end proxy and any browser/agent client may live on a
// different origin than the API. With credentials (the session cookie) the
// Access-Control-Allow-Origin must be a specific origin, not "*", so we echo the
// request Origin when it's allowed.
const ALLOWED = (process.env.TOLLROAD_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function corsHeaders(requestOrigin?: string): Record<string, string> {
  const allowAll = ALLOWED.length === 0;
  // Fail closed in production: echoing an arbitrary request Origin together with
  // Allow-Credentials:true lets any site make credentialed cross-origin calls. If
  // no allow-list is configured in prod, send a blank ACAO so the browser blocks
  // the credentialed response. Local/dev keeps today's permissive echo for convenience.
  const failClosed = allowAll && process.env.NODE_ENV === "production";
  const allow = failClosed
    ? ""
    : allowAll
      ? requestOrigin ?? "*"
      : ALLOWED.includes(requestOrigin ?? "")
        ? requestOrigin!
        : ALLOWED[0]!;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, stripe-signature, Range",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Accept-Payment",
    Vary: "Origin",
  };
}
