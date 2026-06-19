"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMe, logout, type Me } from "@/lib/auth";
import SignInSheet from "@/components/SignInSheet";

/**
 * Nav account control: shows "Sign in" when signed out, or the account name with
 * a sign-out menu when signed in. Drops into any nav-links row.
 */
export default function AuthButton() {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    fetchMe().then((m) => { setMe(m); setLoaded(true); });
  }, []);

  if (!loaded) return <span className="auth-nav-skel" aria-hidden="true" />;

  const account = me?.account ?? null;

  // Auth not configured on the server → don't show a sign-in that can't complete.
  if (!account && !me?.authConfigured) return null;

  if (!account) {
    return (
      <>
        <button className="btn btn-primary" onClick={() => setSheet(true)}>Sign in</button>
        {sheet && (
          <SignInSheet
            onClose={() => setSheet(false)}
            onSignedIn={(m) => { setMe(m); setSheet(false); }}
          />
        )}
      </>
    );
  }

  const isArtist = Boolean(me?.profiles?.artist);

  return (
    <div className="auth-acct">
      <button className="auth-acct-btn" onClick={() => setMenu((v) => !v)}>
        <span className="auth-avatar">{account.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="auth-name">{account.displayName}</span>
      </button>
      {menu && (
        <div className="auth-menu" onMouseLeave={() => setMenu(false)}>
          <div className="auth-menu-head">{isArtist ? "Artist + listener" : "Listener"}</div>
          {!isArtist && <Link className="auth-menu-item" href="/signup" onClick={() => setMenu(false)}>Become an artist</Link>}
          {isArtist && <Link className="auth-menu-item" href="/signup" onClick={() => setMenu(false)}>Artist profile</Link>}
          <Link className="auth-menu-item" href="/browse" onClick={() => setMenu(false)}>Browse music</Link>
          <Link className="auth-menu-item" href="/wallet" onClick={() => setMenu(false)}>Wallet &amp; history</Link>
          <button
            className="auth-menu-item danger"
            onClick={async () => { await logout(); setMe({ account: null, profiles: null }); setMenu(false); }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
