'use client'

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { FOREGROUND, ACCENT, BACKGROUND } from "@/lib/colors";
import WalletView from "@/components/WalletView";
import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";

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
      <header style={{ padding: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, position: "relative", zIndex: 1, backgroundColor: BACKGROUND, backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
          <Image src="/logo.png" alt="TollRoad Music Logo" width={56} height={56} />
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: -0.2 }}>TollRoad Music</div>
        </Link>
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
            <div style={{ width: 220, maxWidth: "90%" }}>
              <AuthButton
                style={{
                  width: "100%",
                  fontSize: "1rem",
                  fontWeight: 800,
                  padding: "12px 16px",
                  borderRadius: "1rem",
                  boxShadow: "0 4px 24px #fee51466"
                }}
              />
            </div>
          </div>
        )}
      </header>
      <WalletView open={walletOpen} onClose={closeWallet} />
    </>
  );
}


