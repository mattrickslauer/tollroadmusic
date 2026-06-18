// Same-origin reverse proxy to the TollRoad backend API.
//
// The front-end is just a consumer of the backend — it holds NO business logic
// and never touches a database. This proxy exists only to (1) keep the session
// as an httpOnly cookie on THIS origin (so XSS can't read the token and there's
// no cross-site cookie/CORS dance), and (2) attach the app's usage-plan API key.
// It translates the cookie into an `Authorization: Bearer` for the backend, and
// streams every response (JSON or audio) straight through.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = (process.env.TOLLROAD_API_BASE ?? "http://localhost:8787/v1").replace(/\/$/, "");
const APP_KEY = process.env.TOLLROAD_APP_API_KEY;
const SESSION_COOKIE = "tollroad_session";
const MAX_AGE = 30 * 24 * 60 * 60;

function backendHeaders(req: NextRequest): Headers {
  const h = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) h.set("content-type", ct);
  const range = req.headers.get("range");
  if (range) h.set("range", range);
  const sig = req.headers.get("stripe-signature");
  if (sig) h.set("stripe-signature", sig);
  const origin = req.headers.get("origin");
  if (origin) h.set("origin", origin);

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) h.set("authorization", `Bearer ${token}`);
  if (APP_KEY) h.set("x-api-key", APP_KEY);
  return h;
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const path = segments.join("/");
  const search = req.nextUrl.search;
  const url = `${BACKEND}/${path}${search}`;

  const method = req.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await req.text();

  let res: Response;
  try {
    res = await fetch(url, { method, headers: backendHeaders(req), body, redirect: "manual" });
  } catch (err) {
    console.error("api proxy: backend unreachable", err);
    return NextResponse.json({ error: "backend unavailable" }, { status: 502 });
  }

  // Auth flows: the backend returns the token in the body (cross-origin Set-Cookie
  // wouldn't stick on this origin), so we mint the httpOnly cookie here.
  if (path === "auth/otp/verify" && res.ok) {
    const data = (await res.json().catch(() => ({}))) as { token?: string };
    const out = NextResponse.json(data, { status: res.status });
    if (data.token) {
      out.cookies.set(SESSION_COOKIE, data.token, cookieOpts(MAX_AGE));
    }
    return out;
  }
  if (path === "auth/logout") {
    const out = NextResponse.json(await res.json().catch(() => ({ ok: true })), { status: res.status });
    out.cookies.set(SESSION_COOKIE, "", cookieOpts(0));
    return out;
  }

  // Everything else: stream the response through verbatim.
  const headers = new Headers();
  for (const k of ["content-type", "content-range", "accept-ranges", "content-length", "cache-control", "accept-payment"]) {
    const v = res.headers.get(k);
    if (v) headers.set(k, v);
  }
  return new NextResponse(res.body, { status: res.status, headers });
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

type Ctx = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export { handle as GET, handle as POST, handle as DELETE, handle as PUT, handle as PATCH };
