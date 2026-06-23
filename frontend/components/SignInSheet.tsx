"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startOtp, verifyOtp, loadAnonId, loadRef, clearRef, type Me } from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN = 30; // seconds

interface Props {
  /** Optional context line, e.g. "Sign in to start listening." */
  reason?: string;
  onClose: () => void;
  onSignedIn: (me: Me) => void;
}

/**
 * Email one-time-passcode sign-in (sonar style, email only). Two steps: enter
 * email → enter the 6-digit code. The session cookie is set server-side on
 * verify; this just surfaces the result.
 */
export default function SignInSheet({ reason, onClose, onSignedIn }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = /^\d{6}$/.test(code);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function sendCode() {
    if (!emailValid || pending) return;
    setPending(true);
    setError(null);
    const res = await startOtp(email.trim());
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? "Could not send a code.");
      return;
    }
    setStep("code");
    setCooldown(RESEND_COOLDOWN);
  }

  async function submitCode() {
    if (!codeValid || pending) return;
    setPending(true);
    setError(null);
    const res = await verifyOtp(email.trim(), code, loadAnonId(), loadRef());
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      setCode("");
      return;
    }
    // Broadcast so app-wide listeners (e.g. the onboarding gate) can react no
    // matter which sheet triggered the sign-in. `claimed` is true on a brand-new
    // account — i.e. a first sign-up.
    window.dispatchEvent(new CustomEvent("tollroad:signedin", { detail: res }));
    clearRef();
    onSignedIn({ account: res.account, profiles: res.profiles });
    router.push("/browse");
  }

  return (
    <div className="auth-overlay" onMouseDown={onClose}>
      <div className="auth-sheet" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="auth-close" onClick={onClose} aria-label="Close">×</button>

        {step === "email" ? (
          <>
            <h2 className="auth-title">Sign in</h2>
            <p className="auth-sub">{reason ?? "Enter your email and we'll send a one-time code."}</p>
            <input
              className="auth-input"
              type="email"
              inputMode="email"
              autoFocus
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
            />
            {error && <p className="auth-error">{error}</p>}
            <button className="btn btn-primary auth-go" disabled={!emailValid || pending} onClick={sendCode}>
              {pending ? "Sending…" : "Send code →"}
            </button>
          </>
        ) : (
          <>
            <h2 className="auth-title">Enter your code</h2>
            <p className="auth-sub">We sent a 6-digit code to <strong>{email.trim()}</strong>.</p>
            <input
              ref={codeRef}
              className="auth-input auth-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submitCode()}
            />
            {error && <p className="auth-error">{error}</p>}
            <button className="btn btn-primary auth-go" disabled={!codeValid || pending} onClick={submitCode}>
              {pending ? "Verifying…" : "Verify & continue →"}
            </button>
            <div className="auth-foot">
              <button className="auth-link" onClick={() => { setStep("email"); setError(null); setCode(""); }}>← Change email</button>
              <button className="auth-link" disabled={cooldown > 0 || pending} onClick={sendCode}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
