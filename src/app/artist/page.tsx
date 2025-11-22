'use client'

import { useEffect, useState } from "react";
import { useCurrentUser, useIsSignedIn, useEvmAddress } from "@coinbase/cdp-hooks";
import Link from "next/link";
import { getBaseUsdcBalanceUsd, normalizeAddressInput } from "@/lib/funds";

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
          maxWidth: 1080,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header: Profile + quick actions */}
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
                width: 56,
                height: 56,
                borderRadius: "50%",
                background:
                  "repeating-linear-gradient(135deg, #eaeaea, #eaeaea 8px, #dcdcdc 8px, #dcdcdc 16px)",
                display: "grid",
                placeItems: "center",
                fontWeight: 600,
              }}
              title="Profile photo"
            >
              {(currentUser?.username || "AR")[0].toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 36, fontWeight: 700 }}>
                {currentUser?.username || "Your Artist Name"}
              </div>
              <div style={{ opacity: 0.7, fontSize: 24 }}>
                {currentUser?.userId
                  ? `Signed in as ${currentUser.userId}`
                  : "Connect wallet to personalize"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/artist/settings"
              style={{
                padding: "8px 12px",
                border: "1px dashed #000",
                borderRadius: 8,
                textDecoration: "none",
                transition: "background 0.15s cubic-bezier(.5,1.8,.75,.8)",
                background: "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              Edit Profile
            </Link>
            <button
              type="button"
              style={{
                padding: "8px 12px",
                border: "1px dashed #000",
                borderRadius: 8,
                background: "transparent",
                cursor: "pointer",
                color: "#000",
                fontFamily: "var(--font-jomhuria)",
                fontSize: 32,
                transition: "background 0.15s cubic-bezier(.5,1.8,.75,.8)",
              }}
              aria-label="Upload new song"
              onClick={() => {}}
              onMouseEnter={e => (e.currentTarget.style.background = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              Upload
            </button>
            <button
              type="button"
              style={{
                padding: "8px 12px",
                border: "1px dashed #000",
                borderRadius: 8,
                background: "transparent",
                cursor: "pointer",
                color: "#000",
                fontFamily: "var(--font-jomhuria)",
                fontSize: 32,
                transition: "background 0.15s cubic-bezier(.5,1.8,.75,.8)",
              }}
              aria-label="Create new album"
              onClick={() => {}}
              onMouseEnter={e => (e.currentTarget.style.background = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              New Album
            </button>
          </div>
        </div>

        {/* KPI cards */}
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

        {/* IP list */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Your IP</div>
            <div style={{ opacity: 0.6, fontSize: 12 }}>
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
                border: "1px dashed #000",
                borderRadius: 10,
                overflow: "hidden",
                minWidth: 480,
                maxWidth: "100%",
              }}
            >
              <div
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 96px 96px 96px",
                  gap: 8,
                  padding: 12,
                  background:
                    "repeating-linear-gradient(135deg, #f1f1f1, #f1f1f1 8px, #e9e9e9 8px, #e9e9e9 16px)",
                  fontWeight: 600,
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
                    padding: 12,
                    borderTop: "1px dashed #000",
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
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        background:
                          "repeating-linear-gradient(135deg, #eaeaea, #eaeaea 8px, #dcdcdc 8px, #dcdcdc 16px)",
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
                        }}
                      >
                        Untitled Track {idx + 1}
                      </div>
                      <div style={{ fontSize: 24, opacity: 0.6 }}>
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
    </div>
  );
}

function StatCard(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div
      style={{
        border: "1px dashed #000",
        borderRadius: 12,
        padding: 16,
        minHeight: 88,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <div style={{ opacity: 0.7, fontSize: 24 }}>{label}</div>
      <div style={{ fontSize: 48, fontWeight: 800 }}>{value}</div>
    </div>
  );
}


