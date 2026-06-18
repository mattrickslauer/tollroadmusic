// Local dev server — runs the exact same router/handlers as the Lambda, over
// Node's http module, so the front-end and the agent-demo can hit a real /v1 API
// without an AWS deploy. Start with `npm run dev` (PORT defaults to 8787).
//
//   TOLLROAD_DSQL_ENDPOINT, TOLLROAD_SESSION_SECRET, AWS creds, etc. come from
//   the environment (a .env exported by the shell), same as the Lambda.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { type ApiRequest } from "./lib/http.ts";
import { dispatch } from "./router.ts";
import { corsHeaders } from "./lib/cors.ts";

const PORT = Number(process.env.PORT ?? 8787);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function stripStage(path: string): string {
  return path.replace(/^\/v1(?=\/|$)/, "") || "/";
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k.toLowerCase()] = v;
  const cors = corsHeaders(headers["origin"]);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const rawBody = await readBody(req);
  let body: unknown = null;
  if (rawBody && (headers["content-type"] ?? "").includes("application/json")) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = null;
    }
  }

  const apiReq: ApiRequest = {
    method: req.method ?? "GET",
    params: {},
    query: Object.fromEntries(url.searchParams),
    headers,
    body,
    rawBody,
  };

  const out = await dispatch(apiReq, stripStage(url.pathname));
  const outHeaders: Record<string, string | string[]> = { ...cors, ...(out.headers ?? {}) };
  if (out.cookies?.length) outHeaders["Set-Cookie"] = out.cookies;

  if (out.raw) {
    outHeaders["Content-Type"] = out.raw.contentType;
    res.writeHead(out.status, outHeaders);
    res.end(typeof out.raw.data === "string" ? out.raw.data : out.raw.data);
    return;
  }
  outHeaders["Content-Type"] = "application/json";
  res.writeHead(out.status, outHeaders);
  res.end(JSON.stringify(out.body ?? {}));
});

server.listen(PORT, () => {
  console.log(`TollRoad API (local) listening on http://localhost:${PORT}/v1`);
});
