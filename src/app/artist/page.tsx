'use client'

import { useEffect, useState } from "react";
import { useCurrentUser, useIsSignedIn, useEvmAddress } from "@coinbase/cdp-hooks";
import Link from "next/link";
import { getBaseUsdcBalanceUsd, normalizeAddressInput } from "@/lib/funds";
import RequireSignIn from "@/components/RequireSignIn";
import { FOREGROUND, ACCENT } from "@/lib/colors";

export default function ArtistPage() {
  const { currentUser } = useCurrentUser();
  const { isSignedIn } = useIsSignedIn();
  const evmAddress = useEvmAddress();
  const [addressString, setAddressString] = useState("");
  const [funds, setFunds] = useState("");
  const [fundsLoading, setFundsLoading] = useState(false);

  useEffect(function onMount() {
    console.log("[Artist] mount");
    return function onUnmount() {
      console.log("[Artist] unmount");
    };
  }, []);

  useEffect(function onAuthChange() {
    console.log("[Artist] auth change", { isSignedIn });
  }, [isSignedIn]);

  useEffect(function onAddressChange() {
    console.log("[Artist] evmAddress change (raw)", evmAddress);
  }, [evmAddress]);

  useEffect(function deriveAddress() {
    setAddressString(normalizeAddressInput(evmAddress));
  }, [evmAddress]);

  useEffect(function fetchFunds() {
    const validAddr = typeof addressString === "string" && addressString.startsWith("0x") && addressString.length === 42;
    if (!isSignedIn || !validAddr) {
      if (!validAddr) {
        console.log("[Artist] skip fetch: invalid address", { addressString });
      } else {
        console.log("[Artist] skip fetch: not signed in");
      }
      setFunds("");
      return;
    }
    console.log("[Artist] fetch funds start", { addressString });
    setFundsLoading(true);
    getBaseUsdcBalanceUsd(addressString)
      .then(function onOk(v) {
        console.log("[Artist] fetch funds ok", { v });
        setFunds(v);
      })
      .catch(function onErr(err) {
        console.log("[Artist] fetch funds error", err);
        setFunds("");
      })
      .finally(function onFinally() {
        console.log("[Artist] fetch funds end");
        setFundsLoading(false);
      });
  }, [isSignedIn, addressString]);

  return (
    <RequireSignIn>
      <div
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "24px 16px",
          color: "#000",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              aria-hidden
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                border: `2px solid ${FOREGROUND}`,
                background: "#ffffff",
                boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
                display: "grid",
                placeItems: "center",
                fontWeight: 600,
                fontSize: 36,
              }}
              title="Profile photo"
            >
              {(currentUser?.username || "AR")[0].toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 72, fontWeight: 900 }}>
                {currentUser?.username || "Your Artist Name"}
              </div>
              <div style={{ opacity: 0.7, fontSize: 32 }}>
                {currentUser?.userId
                  ? `Signed in as ${currentUser.userId}`
                  : "Connect wallet to personalize"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/artist/settings"
              style={{
                padding: "12px 18px",
                border: `2px solid ${FOREGROUND}`,
                borderRadius: 10,
                textDecoration: "none",
                transition: "transform 200ms ease, box-shadow 200ms ease",
                background: "#ffffff",
                color: "#000",
                fontWeight: 800,
                fontSize: 24,
                boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
              }}
            >
              Edit Profile
            </Link>
            <Link
              href="/artist/upload"
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                backgroundColor: ACCENT,
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 24,
                transition: "transform 200ms ease, box-shadow 200ms ease",
                display: "inline-block",
                textDecoration: "none",
                textAlign: "center",
                boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
              }}
              aria-label="Upload new song"
            >
              Upload
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <StatCard label="Total Wallet Funds" value={funds ? `$${funds}` : "$—.—"} />
          <StatCard label="Minutes Sold (This Month)" value="—" />
          <StatCard label="Unique Payers" value="—" />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 32 }}>Your IP</div>
            <div style={{ opacity: 0.6, fontSize: 20 }}>
              Songs and albums you manage
            </div>
          </div>
          <div
            style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
          >
            <div
              role="table"
              aria-label="Artist IP table"
              style={{
                border: `2px solid ${FOREGROUND}`,
                borderRadius: 12,
                overflow: "hidden",
                minWidth: 480,
                maxWidth: "100%",
                background: "#ffffff",
                boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
              }}
            >
              <div
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 96px 96px 96px",
                  gap: 8,
                  padding: 16,
                  background:
                    "repeating-linear-gradient(135deg, #f1f1f1, #f1f1f1 8px, #e9e9e9 8px, #e9e9e9 16px)",
                  fontWeight: 800,
                  fontSize: 20,
                }}
              >
                <div>Title</div>
                <div>Type</div>
                <div>Status</div>
                <div style={{ textAlign: "right" }}>Earnings</div>
              </div>
  
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  role="row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 96px 96px 96px",
                    gap: 8,
                    padding: 16,
                    borderTop: `2px solid ${FOREGROUND}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        border: `2px solid ${FOREGROUND}`,
                        background: "#ffffff",
                        boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
                        flex: "0 0 auto",
                      }}
                      title="Cover art"
                    />
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          maxWidth: "100%",
                          fontWeight: 800,
                          fontSize: 20,
                        }}
                      >
                        Untitled Track {idx + 1}
                      </div>
                      <div style={{ fontSize: 20, opacity: 0.6 }}>
                        0:00 sold this month
                      </div>
                    </div>
                  </div>
                  <div>Song</div>
                  <div>Draft</div>
                  <div style={{ textAlign: "right" }}>$0.00</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </RequireSignIn>
  );
}

function StatCard(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div
      style={{
        border: `2px solid ${FOREGROUND}`,
        borderRadius: 12,
        padding: 20,
        minHeight: 120,
        background: "#ffffff",
        boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <div style={{ opacity: 0.7, fontSize: 28 }}>{label}</div>
      <div style={{ fontSize: 56, fontWeight: 900 }}>{value}</div>
    </div>
  );
}


