// POST /api/auth/otp/verify  { email, code, anonId? }
// Verifies the code, claims the caller's anonymous account (or signs into the
// existing one), ensures a listener profile, and installs the session cookie.
import { verifyOtp } from "@/lib/server/otp";
import { claimOrSignIn, ensureListenerProfile, getProfiles } from "@/lib/server/accounts";
import { createSessionToken, sessionCookie, sessionConfigured } from "@/lib/server/session";
import { dsqlConfigured } from "@/lib/dsql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

export async function POST(request: Request) {
  if (!dsqlConfigured() || !sessionConfigured()) {
    return Response.json({ error: "auth not configured" }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const anonId = typeof body?.anonId === "string" ? body.anonId : undefined;

  if (!EMAIL_RE.test(email)) return Response.json({ error: "valid email required" }, { status: 400 });
  if (!CODE_RE.test(code)) return Response.json({ error: "6-digit code required" }, { status: 400 });

  const verdict = await verifyOtp(email, code);
  if (!verdict.ok) {
    // Generic message — don't distinguish wrong code from expired/burned.
    return Response.json({ error: "invalid or expired code" }, { status: 401 });
  }

  const { account, claimed } = await claimOrSignIn(anonId ?? "", { email, authMethod: "email_otp" });
  await ensureListenerProfile(account.id);
  const profiles = await getProfiles(account.id);
  const token = await createSessionToken(account);
  return Response.json(
    { account: { id: account.id, displayName: account.displayName }, profiles, claimed },
    { status: 200, headers: { "Set-Cookie": sessionCookie(token) } },
  );
}
