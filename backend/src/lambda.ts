// API Gateway (REST, proxy integration) entry point. Adapts the proxy event to
// our framework-free ApiRequest, dispatches through the shared router, and maps
// the ApiResponse back to a proxy result. Bytes (audio) only flow through here
// in the no-CDN fallback; in prod /stream returns a signed CloudFront URL.
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { type ApiRequest } from "./lib/http.ts";
import { dispatch } from "./router.ts";
import { corsHeaders } from "./lib/cors.ts";

function lowerHeaders(h: APIGatewayProxyEvent["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) if (v != null) out[k.toLowerCase()] = v;
  return out;
}

function stripStage(path: string): string {
  return path.replace(/^\/v1(?=\/|$)/, "") || "/";
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = lowerHeaders(event.headers);
  const origin = headers["origin"];
  const cors = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  const rawBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body
    : "";
  let body: unknown = null;
  if (rawBody && (headers["content-type"] ?? "").includes("application/json")) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = null;
    }
  }

  const req: ApiRequest = {
    method: event.httpMethod,
    params: {},
    query: (event.queryStringParameters as Record<string, string>) ?? {},
    headers,
    body,
    rawBody,
    apiKeyId: event.requestContext?.identity?.apiKeyId ?? undefined,
  };

  const res = await dispatch(req, stripStage(event.path));

  const outHeaders: Record<string, string> = { ...cors, ...(res.headers ?? {}) };
  if (res.cookies?.length) {
    // REST API: multiValueHeaders carries multiple Set-Cookie values.
    return {
      statusCode: res.status,
      headers: outHeaders,
      multiValueHeaders: { "Set-Cookie": res.cookies },
      ...serializeBody(res, outHeaders),
    } as APIGatewayProxyResult;
  }
  return { statusCode: res.status, headers: outHeaders, ...serializeBody(res, outHeaders) };
}

function serializeBody(
  res: { body?: unknown; raw?: { contentType: string; data: Buffer | string } },
  headers: Record<string, string>,
): { body: string; isBase64Encoded?: boolean } {
  if (res.raw) {
    headers["Content-Type"] = res.raw.contentType;
    if (Buffer.isBuffer(res.raw.data)) {
      return { body: res.raw.data.toString("base64"), isBase64Encoded: true };
    }
    return { body: res.raw.data };
  }
  headers["Content-Type"] = "application/json";
  return { body: JSON.stringify(res.body ?? {}) };
}
