"use client";

import { useEffect, useState } from "react";
import { fetchMe, type Me } from "@/lib/auth";
import SignInSheet from "@/components/SignInSheet";

type Status =
  | { kind: "idle" | "saving" }
  | { kind: "error"; msg: string }
  | { kind: "done"; name: string };

export default function SignupForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Artist is a profile of an account, so creating one needs a session.
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    fetchMe().then((m) => { setMe(m); setLoaded(true); });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "saving") return;
    setStatus({ kind: "saving" });

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // Session expired / not signed in — prompt sign-in, then retry.
        setStatus({ kind: "idle" });
        setSheet(true);
        return;
      }
      if (!res.ok) {
        setStatus({ kind: "error", msg: json.error || "Something went wrong. Please try again." });
        return;
      }
      setStatus({ kind: "done", name: json.name || (data.name as string) });
      form.reset();
    } catch {
      setStatus({ kind: "error", msg: "Network error. Please try again." });
    }
  }

  // Not signed in → gate the form behind email sign-in. When auth isn't
  // configured we skip the gate and show the form (it returns 503 on submit,
  // the same as before auth existed).
  if (loaded && !me?.account && me?.authConfigured) {
    return (
      <div className="signup-gate">
        <p>Artist profiles attach to your account. Sign in with your email to continue — it takes a few seconds.</p>
        <button className="btn btn-primary" onClick={() => setSheet(true)}>Sign in to continue</button>
        {sheet && (
          <SignInSheet
            reason="Sign in to create your artist profile."
            onClose={() => setSheet(false)}
            onSignedIn={(m) => { setMe(m); setSheet(false); }}
          />
        )}
      </div>
    );
  }

  if (status.kind === "done") {
    return (
      <div className="signup-done">
        <div className="signup-check" aria-hidden="true">✓</div>
        <h2>You&apos;re on the road, {status.name}.</h2>
        <p>
          Your details are saved. We&apos;ll be in touch about bringing your catalog on and
          getting you paid per minute played.
        </p>
        <button className="btn btn-ghost" onClick={() => setStatus({ kind: "idle" })}>
          Sign up another artist
        </button>
      </div>
    );
  }

  const saving = status.kind === "saving";

  return (
    <>
    {sheet && (
      <SignInSheet
        reason="Sign in to create your artist profile."
        onClose={() => setSheet(false)}
        onSignedIn={(m) => { setMe(m); setSheet(false); }}
      />
    )}
    <form className="signup-form" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span className="field-label">Artist / band name <i>*</i></span>
        <input name="name" type="text" required maxLength={120} placeholder="e.g. Midnight Toll" autoComplete="off" />
      </label>

      <label className="field">
        <span className="field-label">Email <i>*</i></span>
        <input name="email" type="email" required maxLength={254} placeholder="you@example.com" autoComplete="email" />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Genre</span>
          <input name="genre" type="text" maxLength={80} placeholder="e.g. Synthwave" autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">Location</span>
          <input name="location" type="text" maxLength={120} placeholder="City, country" autoComplete="off" />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Website / link</span>
        <input name="website" type="text" maxLength={200} placeholder="https://…" autoComplete="off" />
      </label>

      <label className="field">
        <span className="field-label">Short bio</span>
        <textarea name="bio" maxLength={2000} rows={3} placeholder="Tell listeners who you are." />
      </label>

      {status.kind === "error" && <p className="signup-error" role="alert">{status.msg}</p>}

      <button className="btn btn-primary signup-submit" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Join TollRoad →"}
      </button>
      <p className="signup-fine">No fees to join. Set your own per-minute rate later.</p>
    </form>
    </>
  );
}
