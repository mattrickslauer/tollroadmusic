// Client-side auth helpers: the anonymous device id and the email-OTP sign-in
// calls. The session itself is an httpOnly cookie the browser sends
// automatically — JS never reads or stores a token. Ported from sonar
// (email-only; Google one-tap dropped for v1).

const ANON_KEY = "tollroad_uid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Account {
  id: string;
  displayName: string;
  handle?: string | null;
}
export interface Profiles {
  artist: { id: string; name: string; genre: string | null } | null;
  listener: { balanceCents: number; onboardingGiftClaimed?: boolean } | null;
}
export interface Me {
  account: Account | null;
  profiles: Profiles | null;
  /** False when the server has no session secret / DSQL — clients shouldn't
   *  gate behind a sign-in that can't complete. */
  authConfigured?: boolean;
}

/**
 * The persistent anonymous account id (a UUID) in localStorage. Created on first
 * read. Returns "" if storage is unavailable (the API then needs a session).
 */
export function loadAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id || !UUID_RE.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** The currently signed-in account + profiles, or nulls. Reads the cookie. */
export async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch("/api/v1/auth/me", { cache: "no-store" });
    if (!res.ok) return { account: null, profiles: null, authConfigured: false };
    return (await res.json()) as Me;
  } catch {
    return { account: null, profiles: null, authConfigured: false };
  }
}

/** Request an email OTP. */
export async function startOtp(email: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/v1/auth/otp/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => null);
  return { ok: false, error: data?.error ?? `error ${res.status}` };
}

/** Verify the OTP and claim/sign-in. On success the session cookie is set. */
export async function verifyOtp(
  email: string,
  code: string,
  anonId: string,
  ref?: string,
): Promise<{ account: Account; profiles: Profiles; claimed: boolean } | { error: string }> {
  const res = await fetch("/api/v1/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code, anonId, ref }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: data?.error ?? `error ${res.status}` };
  return data as { account: Account; profiles: Profiles; claimed: boolean };
}

const REF_KEY = "tollroad_ref";
export function saveRef(ref: string): void {
  try { if (ref) localStorage.setItem(REF_KEY, ref); } catch {}
}
export function loadRef(): string {
  try { return localStorage.getItem(REF_KEY) ?? ""; } catch { return ""; }
}
export function clearRef(): void {
  try { localStorage.removeItem(REF_KEY); } catch {}
}

/** Clear the session. */
export async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST" });
}
