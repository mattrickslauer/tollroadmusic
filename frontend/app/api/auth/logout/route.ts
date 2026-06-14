// POST /api/auth/logout — clears the session cookie.
import { clearSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": clearSessionCookie() } });
}
