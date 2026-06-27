/**
 * TollRoad HTTP API client — thin authenticated wrapper.
 *
 * Designed for testability: accepts an injectable `fetchImpl` (defaults to
 * the global `fetch`). Auth follows the same pattern as scripts/agent-demo.mjs:
 *   - x-api-key header from apiKey
 *   - Authorization: Bearer <token> if token is set
 */

export interface CallResult {
  status: number;
  data: unknown;
}

export interface TollRoadClient {
  call(method: string, path: string, body?: unknown): Promise<CallResult>;
}

export interface MakeClientOptions {
  /** Base URL, e.g. https://api.example.com/v1  (no trailing slash) */
  base: string;
  /** API key sent as x-api-key header */
  apiKey: string;
  /** Optional bearer token (end-user session JWT) */
  token?: string;
  /** Injectable fetch implementation (defaults to global fetch) */
  fetchImpl?: typeof fetch;
}

export function makeClient(opts: MakeClientOptions): TollRoadClient {
  const { base, apiKey, token, fetchImpl = fetch } = opts;
  const base_ = base.replace(/\/$/, "");

  const authHeaders: Record<string, string> = {
    "x-api-key": apiKey,
  };
  if (token) {
    authHeaders["authorization"] = `Bearer ${token}`;
  }

  return {
    async call(method: string, path: string, body?: unknown): Promise<CallResult> {
      const url = `${base_}${path}`;
      const headers: Record<string, string> = { ...authHeaders };
      let bodyStr: string | undefined;

      if (body !== undefined) {
        headers["content-type"] = "application/json";
        bodyStr = JSON.stringify(body);
      }

      const res = await fetchImpl(url, {
        method,
        headers,
        body: bodyStr,
      });

      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    },
  };
}

/**
 * Create a client from environment variables.
 * Reads TOLLROAD_API_BASE, TOLLROAD_API_KEY, and optionally TOLLROAD_TOKEN.
 */
export function makeClientFromEnv(fetchImpl?: typeof fetch): TollRoadClient {
  const base = process.env["TOLLROAD_API_BASE"];
  const apiKey = process.env["TOLLROAD_API_KEY"];
  if (!base) throw new Error("TOLLROAD_API_BASE env var is required");
  if (!apiKey) throw new Error("TOLLROAD_API_KEY env var is required");
  const token = process.env["TOLLROAD_TOKEN"];
  return makeClient({ base, apiKey, token, fetchImpl });
}
