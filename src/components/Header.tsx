'use client'

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { FOREGROUND, ACCENT } from "@/lib/colors";
import WalletView from "@/components/WalletView";

export default function Header() {
  const { isSignedIn } = useIsSignedIn();
  const [walletOpen, setWalletOpen] = useState(false);

  function openWallet() {
    setWalletOpen(true);
  }

  function closeWallet() {
    setWalletOpen(false);
  }

  return (
    <>
      <header style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, position: "relative", zIndex: 1, backgroundColor: "rgba(255,255,255,0.7)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image src="/logo.png" alt="TollRoad Music Logo" width={56} height={56} />
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: -0.2 }}>TollRoad Music</div>
        </div>
        {isSignedIn ? (
          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/listener"
              style={{
                border: `2px solid ${FOREGROUND}`,
                color: FOREGROUND,
                padding: "10px 16px",
                borderRadius: 10,
                fontWeight: 800,
                textDecoration: "none",
                backgroundColor: "transparent",
                boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
            >
              Listener
            </Link>
            <Link
              href="/artist"
              style={{
                border: `2px solid ${FOREGROUND}`,
                color: FOREGROUND,
                padding: "10px 16px",
                borderRadius: 10,
                fontWeight: 800,
                textDecoration: "none",
                backgroundColor: "transparent",
                boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
            >
              Artist
            </Link>
            <button
              type="button"
              onClick={openWallet}
              style={{
                backgroundColor: ACCENT,
                color: "#ffffff",
                padding: "12px 18px",
                borderRadius: 10,
                fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
                cursor: "pointer",
              }}
            >
              Account
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/listener"
              style={{
                backgroundColor: ACCENT,
                color: "#ffffff",
                padding: "12px 18px",
                borderRadius: 10,
                fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
            >
              Start Listening
            </Link>
            <Link
              href="/artist"
              style={{
                border: `2px solid ${FOREGROUND}`,
                color: FOREGROUND,
                padding: "10px 16px",
                borderRadius: 10,
                fontWeight: 800,
                textDecoration: "none",
                backgroundColor: "transparent",
                boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
            >
              For Artists
            </Link>
          </div>
        )}
      </header>
      <WalletView open={walletOpen} onClose={closeWallet} />
    </>
  );
}


