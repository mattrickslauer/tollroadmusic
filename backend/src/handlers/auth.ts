// Auth handlers — email OTP + session. Ports app/api/auth/* from the front-end.
// verify() returns the JWT in the body (so any client can hold it) AND as a
// Set-Cookie (so the front-end proxy can keep it httpOnly).
import { type Handler, ok, error, getSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "../lib/jwt.ts";
import { startOtp, verifyOtp } from "../domain/otp.ts";
import { sendOtpEmail } from "../domain/email.ts";
import { claimOrSignIn, ensureListenerProfile, getProfiles } from "../domain/accounts.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const otpStart: Handler = async (req) => {
  if (!dsqlConfigured() || !sessionConfigured()) return error(503, "auth not configured");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const email = asString(b.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return error(400, "valid email required");

  const result = await startOtp(email);
  if (!result.ok) return error(429, "please wait before requesting another code");
  try {
    await sendOtpEmail(email, result.code);
  } catch (err) {
    console.error("sendOtpEmail failed", err);
    return error(502, "could not send code");
  }
  return ok({ ok: true });
};

export const otpVerify: Handler = async (req) => {
  if (!dsqlConfigured() || !sessionConfigured()) return error(503, "auth not configured");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const email = asString(b.email);
  const code = asString(b.code);
  const anonId = typeof b.anonId === "string" ? b.anonId : undefined;
  const displayName = typeof b.displayName === "string" ? b.displayName : undefined;

  if (!EMAIL_RE.test(email)) return error(400, "valid email required");
  if (!CODE_RE.test(code)) return error(400, "6-digit code required");

  const verdict = await verifyOtp(email, code);
  if (!verdict.ok) return error(401, "invalid or expired code");

  const { account, claimed } = await claimOrSignIn(anonId ?? "", { email, displayName, authMethod: "email_otp" });
  await ensureListenerProfile(account.id);
  const profiles = await getProfiles(account.id);
  const token = await createSessionToken(account);

  return {
    status: 200,
    body: { token, account: { id: account.id, displayName: account.displayName }, profiles, claimed },
    cookies: [cookie(SESSION_COOKIE, token, SESSION_MAX_AGE_SECONDS)],
  };
};

export const me: Handler = async (req) => {
  const authConfigured = sessionConfigured() && dsqlConfigured();
  const session = authConfigured ? await getSession(req) : null;
  if (!session) return ok({ account: null, profiles: null, authConfigured });
  let profiles = null;
  try {
    profiles = await getProfiles(session.sub);
  } catch (err) {
    console.error("me: profiles read failed", err);
  }
  return ok({ account: { id: session.sub, displayName: session.name }, profiles, authConfigured });
};

export const logout: Handler = async () => ({
  status: 200,
  body: { ok: true },
  cookies: [cookie(SESSION_COOKIE, "", 0)],
});

function cookie(name: string, value: string, maxAge: number): string {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
