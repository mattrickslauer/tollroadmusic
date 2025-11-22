'use client'

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FOREGROUND, ACCENT, BACKGROUND } from "../lib/colors";

export default function Home() {
  const [hoverListen, setHoverListen] = useState(false);
  const [hoverArtist, setHoverArtist] = useState(false);

  function onEnterListen() {
    setHoverListen(true);
  }

  function onLeaveListen() {
    setHoverListen(false);
  }

  function onEnterArtist() {
    setHoverArtist(true);
  }

  function onLeaveArtist() {
    setHoverArtist(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", color: FOREGROUND, position: "relative", overflow: "hidden", backgroundColor: ACCENT }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -140, left: -80, width: 420, height: 420, background: `radial-gradient(closest-side, ${ACCENT}, transparent)`, opacity: 0.15, filter: "blur(40px)" }} />
        <div style={{ position: "absolute", bottom: -180, right: -100, width: 520, height: 520, background: `radial-gradient(closest-side, ${ACCENT}, transparent)`, opacity: 0.12, filter: "blur(54px)" }} />
      </div>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: 24, gap: 36, position: "relative", zIndex: 1 }}>
        <section style={{ width: "100%", maxWidth: 1100, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
          <Image src="/logo.png" alt="TollRoad Music Logo" width={96} height={96} />
          <h1 style={{ margin: 0, fontSize: 112, lineHeight: 1.05, fontWeight: 1000, letterSpacing: -0.5, textShadow: "0 2px 0 rgba(0,0,0,0.04)" }}>Pay-as-you-go music, onchain.</h1>
          <p style={{ margin: 0, fontSize: 36, maxWidth: 820 }}>
            TollRoad Music is a platform for independent artists and IP holders to charge pay‑as‑you‑go, powered by x402 and decentralized storage on Filecoin.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              href="/listener"
              onMouseEnter={onEnterListen}
              onMouseLeave={onLeaveListen}
              style={{
                backgroundColor: BACKGROUND,
                color: "#000000",
                padding: "14px 20px",
                borderRadius: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontSize: 34,
                boxShadow: hoverListen ? "0 16px 36px rgba(0,0,0,0.16)" : "0 12px 28px rgba(0,0,0,0.14)",
                transform: hoverListen ? "translateY(-2px)" : "none",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
            >
              Start Listening
            </Link>
            <Link
              href="/artist"
              onMouseEnter={onEnterArtist}
              onMouseLeave={onLeaveArtist}
              style={{
                border: `2px solid ${FOREGROUND}`,
                color: "#000000",
                padding: "12px 18px",
                borderRadius: 12,
                fontWeight: 800,
                textDecoration: "none",
                fontSize: 34,
                backgroundColor: BACKGROUND,
                boxShadow: hoverArtist ? "0 14px 30px rgba(0,0,0,0.12)" : "0 10px 24px rgba(0,0,0,0.08)",
                transform: hoverArtist ? "translateY(-2px)" : "none",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
            >
              I’m an Artist
            </Link>
          </div>
        </section>

        <section style={{ width: "100%", maxWidth: 1100, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", border: `2px solid ${FOREGROUND}`, borderRadius: 14, padding: 22, backgroundColor: BACKGROUND, boxShadow: "0 10px 24px rgba(0,0,0,0.06)", position: "relative", overflow: "hidden" }}>
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 48 }}>
              Artist
            </h2>
            <ol style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Sign up with Coinbase embedded wallet</li>
              <li>Upload your music</li>
              <li>Set your price and splits</li>
              <li>Go live and get paid</li>
            </ol>
            <div style={{ marginTop: 12 }}>
              <Link
                href="/artist"
                style={{
                  backgroundColor: ACCENT,
                  color: "#ffffff",
                  padding: "12px 16px",
                  borderRadius: 10,
                  fontWeight: 800,
                  textDecoration: "none",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                  transition: "transform 200ms ease, box-shadow 200ms ease",
                }}
              >
                Get Started as Artist
              </Link>
            </div>
            <div style={{ position: "absolute", right: -10, bottom: 0, pointerEvents: "none", zIndex: 0, width: "48%", height: "90%" }}>
              <Image src="/images/l.png" alt="Artist" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
            </div>
          </div>
          <div style={{ flex: "1 1 320px", border: `2px solid ${FOREGROUND}`, borderRadius: 14, padding: 22, backgroundColor: BACKGROUND, boxShadow: "0 10px 24px rgba(0,0,0,0.06)", position: "relative", overflow: "hidden" }}>
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 48 }}>
              Listener
            </h2>
            <ol style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Sign up with Coinbase embedded wallet</li>
              <li>Fund your account with USD</li>
              <li>Find and stream music</li>
            </ol>
            <div style={{ marginTop: 12 }}>
              <Link
                href="/listener"
                style={{
                  border: `2px solid ${FOREGROUND}`,
                  color: FOREGROUND,
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontWeight: 800,
                  textDecoration: "none",
                  backgroundColor: "transparent",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                  transition: "transform 200ms ease, box-shadow 200ms ease",
                }}
              >
                Start Listening
              </Link>
            </div>
            <div style={{ position: "absolute", right: -10, bottom: 0, pointerEvents: "none", zIndex: 0, width: "44%", height: "88%" }}>
              <Image src="/images/listener.png" alt="Listener" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
            </div>
          </div>
        </section>

        <section style={{ width: "100%", maxWidth: 1100 }}>
          <div style={{ position: "relative", width: "100%", paddingTop: "56%", borderRadius: 14, overflow: "hidden", boxShadow: "0 16px 36px rgba(0,0,0,0.12)", border: `2px solid ${FOREGROUND}`, backgroundColor: "rgba(0,0,0,0.02)" }}>
            <Image src="/slides/howitworks.png" alt="How it works" fill style={{ objectFit: "cover" }} />
          </div>
        </section>

        <section style={{ width: "100%", maxWidth: 1100 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
            <div style={{ padding: 24, borderRadius: 14, backgroundColor: ACCENT, color: "#ffffff", boxShadow: "0 16px 36px rgba(0,0,0,0.18)" }}>
              <div style={{ fontWeight: 1000, fontSize: 48, lineHeight: 1.15, letterSpacing: -0.3 }}>Stop monthly subscriptions.</div>
              <div style={{ marginTop: 10, fontWeight: 800, fontSize: 32, opacity: 0.95 }}>Pay only for the minutes you listen.</div>
            </div>
            <div style={{ padding: 24, borderRadius: 14, border: `2px solid ${FOREGROUND}`, backgroundColor: "rgba(0,0,0,0.02)", boxShadow: "0 12px 28px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 1000, fontSize: 48, lineHeight: 1.15, letterSpacing: -0.3 }}>Artists paid instantly.</div>
              <div style={{ marginTop: 10, fontWeight: 800, fontSize: 32 }}>Onchain splits. No middlemen.</div>
            </div>
            <div style={{ padding: 24, borderRadius: 14, border: `2px solid ${FOREGROUND}`, backgroundColor: "rgba(0,0,0,0.02)", boxShadow: "0 12px 28px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 1000, fontSize: 48, lineHeight: 1.15, letterSpacing: -0.3 }}>Your wallet, your access.</div>
              <div style={{ marginTop: 10, fontWeight: 800, fontSize: 32 }}>Coinbase embedded wallet—no seed phrases.</div>
            </div>
            <div style={{ padding: 24, borderRadius: 14, border: `2px solid ${FOREGROUND}`, backgroundColor: "rgba(0,0,0,0.02)", boxShadow: "0 12px 28px rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 1000, fontSize: 48, lineHeight: 1.15, letterSpacing: -0.3 }}>Open, decentralized storage.</div>
              <div style={{ marginTop: 10, fontWeight: 800, fontSize: 32 }}>Powered by Filecoin.</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
