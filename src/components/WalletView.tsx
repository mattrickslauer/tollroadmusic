'use client'

import { useEffect, useState } from "react";
import Image from "next/image";
import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";
import { useIsSignedIn, useEvmAddress } from "@coinbase/cdp-hooks";
import { FOREGROUND, ACCENT } from "@/lib/colors";
import { getBaseUsdcBalanceUsd, normalizeAddressInput } from "@/lib/funds";

type WalletViewProps = {
  open: boolean;
  onClose: () => void;
};

export default function WalletView(props: WalletViewProps) {
  const { open, onClose } = props;
  const { isSignedIn, isLoading } = useIsSignedIn();
  const evmAddress = useEvmAddress();
  const [copied, setCopied] = useState(false);
  const [addressString, setAddressString] = useState("");
  const [usdcBase, setUsdcBase] = useState("");
  const [fundsLoading, setFundsLoading] = useState(false);
  const [onrampLoading, setOnrampLoading] = useState(false);
  const [onrampError, setOnrampError] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState(10);

  useEffect(function onMount() {
    console.log("[WalletView] mount");
    return function onUnmount() {
      console.log("[WalletView] unmount");
    };
  }, []);

  useEffect(function onOpenChange() {
    console.log("[WalletView] open change", { open });
  }, [open]);

  useEffect(function onAuthChange() {
    console.log("[WalletView] auth change", { isSignedIn, isLoading });
  }, [isSignedIn, isLoading]);

  useEffect(function onAddressChange() {
    console.log("[WalletView] evmAddress change (raw)", evmAddress);
  }, [evmAddress]);

  function getAddressString(value: unknown) {
    return normalizeAddressInput(value);
  }

  function formatAddress(a?: string) {
    if (!a || a.length < 10) return a || "";
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
  }

  function copyAddress() {
    console.log("[WalletView] copyAddress clicked");
    const addr = addressString;
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopied(true);
    window.setTimeout(function resetCopied() {
      setCopied(false);
    }, 1500);
  }
  
  useEffect(function deriveAddress() {
    setAddressString(getAddressString(evmAddress));
  }, [evmAddress]);
  console.log("[WalletView] computed render state", {
    open,
    isSignedIn,
    isLoading,
    evmAddress,
    addressString,
    copied,
    usdcBase,
    fundsLoading,
    onrampLoading,
    onrampError
  });

  function fetchBaseUsdcBalance() {
    const addr = addressString;
    if (!addr) {
      setUsdcBase("");
      return;
    }
    setFundsLoading(true);
    getBaseUsdcBalanceUsd(addr)
      .then(function onOk(v) { setUsdcBase(v); })
      .catch(function onErr() { setUsdcBase(""); })
      .finally(function onFinally() { setFundsLoading(false); });
  }

  async function requestOnrampSessionToken() {
    const addr = addressString;
    if (!addr) return "";
    try {
      const res = await fetch("/api/onramp-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addr,
          blockchains: ["base"],
          assets: ["USDC"],
        }),
      });
      if (!res.ok) return "";
      const json = await res.json();
      const token = json?.token;
      if (typeof token === "string" && token.length > 0) return token;
      return "";
    } catch (e) {
      return "";
    }
  }

  function buildSandboxOnrampUrl(token: string) {
    const base = "https://pay-sandbox.coinbase.com/buy/select-asset";
    const params = new URLSearchParams();
    params.set("sessionToken", token);
    params.set("defaultNetwork", "base");
    params.set("defaultAsset", "USDC");
    params.set("presetFiatAmount", String(purchaseAmount));
    return `${base}?${params.toString()}`;
  }

  async function openOnramp() {
    if (onrampLoading) return;
    setOnrampError("");
    setOnrampLoading(true);
    try {
      const token = await requestOnrampSessionToken();
      if (!token) {
        setOnrampError("Unable to start onramp. Try again.");
        return;
      }
      const url = buildSandboxOnrampUrl(token);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setOnrampError("Unable to start onramp. Try again.");
    } finally {
      setOnrampLoading(false);
    }
  }

  useEffect(function syncBaseUsdc() {
    if (!open || !isSignedIn || !addressString) {
      setUsdcBase("");
      return;
    }
    fetchBaseUsdcBalance();
  }, [open, isSignedIn, addressString]);

  function getBasescanUrl() {
    const addr = addressString;
    if (!addr) return "";
    return `https://basescan.org/address/${addr}`;
  }

  function clampAmount(n: number) {
    const min = 1;
    const max = 500;
    if (Number.isNaN(n)) return min;
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function handleAmountInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setPurchaseAmount(clampAmount(val));
  }

  function handleAmountSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setPurchaseAmount(clampAmount(val));
  }

  function handleOverlayClick() {
    console.log("[WalletView] overlay click -> close");
    onClose();
  }

  function stop(e: React.MouseEvent) {
    console.log("[WalletView] modal inner click stopPropagation");
    e.stopPropagation();
  }

  function handleCloseButton() {
    console.log("[WalletView] close button click");
    onClose();
  }

  if (!open) {
    console.log("[WalletView] closed, no render", { open });
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={handleOverlayClick}
    >
      <div
        style={{
          width: "min(520px, 92vw)",
          borderRadius: 16,
          border: `2px solid ${FOREGROUND}`,
          background: "#ffffff",
          boxShadow: "0 16px 36px rgba(0,0,0,0.2)",
          color: "#000",
          padding: 20,
        }}
        onClick={stop}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 72, fontWeight: 900 }}>Wallet</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 9999, border: `2px solid ${FOREGROUND}`, backgroundColor: "#f8f8f8" }}>
              <span style={{ position: "relative", width: 64, height: 64, display: "inline-block" }}>
                <Image src="/images/base-logo.png" alt="Base" fill style={{ objectFit: "contain" }} />
              </span>
              <div style={{ fontSize: 24, fontWeight: 800, opacity: 0.8 }}>Base Network</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseButton}
            style={{
              border: `2px solid ${FOREGROUND}`,
              color: FOREGROUND,
              padding: "8px 12px",
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 24,
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
            aria-label="Close wallet"
          >
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 48, opacity: 0.7 }}>Address</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 12, border: `2px solid ${FOREGROUND}`, backgroundColor: "#fafafa", maxWidth: "100%", flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ fontFamily: "monospace", fontSize: "clamp(12px, 4vw, 36px)", fontWeight: 700, letterSpacing: 0.5, flex: 1, minWidth: 0, wordBreak: "break-all", lineHeight: 1.1 }}>
                  {addressString || "—"}
                </div>
                <button
                  type="button"
                  onClick={copyAddress}
                  disabled={!addressString}
                  style={{
                    border: `2px solid ${FOREGROUND}`,
                    color: FOREGROUND,
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: 24,
                    backgroundColor: "white",
                    cursor: addressString ? "pointer" : "not-allowed",
                    opacity: addressString ? 1 : 0.5,
                  }}
                  title={addressString ? `Copy ${addressString}` : "No address"}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 10, border: `2px solid ${FOREGROUND}` }}>
                <span style={{ position: "relative", width: 80, height: 80, display: "inline-block" }}>
                  <Image src="/images/base-logo.png" alt="Base" fill style={{ objectFit: "contain" }} />
                </span>
                <div style={{ fontSize: 28, fontWeight: 800, opacity: 0.8 }}>Base network wallet</div>
              </div>
              <a
                href={getBasescanUrl() || undefined}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  border: `2px solid ${FOREGROUND}`,
                  color: FOREGROUND,
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 24,
                  textDecoration: "none",
                  pointerEvents: addressString ? "auto" : "none",
                  opacity: addressString ? 1 : 0.5,
                }}
                aria-disabled={!addressString}
              >
                View on BaseScan
              </a>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
              padding: 16,
              borderRadius: 12,
              border: `2px solid ${FOREGROUND}`,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 48, opacity: 0.7 }}>Purchase Amount (USD)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12 }}>
              <input
                type="range"
                min={1}
                max={500}
                step={1}
                value={purchaseAmount}
                onChange={handleAmountSliderChange}
                style={{ width: "100%" }}
                aria-label="Purchase amount slider"
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 800 }}>$</div>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={purchaseAmount}
                  onChange={handleAmountInputChange}
                  style={{
                    width: 160,
                    border: `2px solid ${FOREGROUND}`,
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                  aria-label="Purchase amount input"
                />
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 10,
              padding: 16,
              borderRadius: 12,
              border: `2px solid ${FOREGROUND}`,
              background:
                "repeating-linear-gradient(135deg, #f7f7f7, #f7f7f7 8px, #efefef 8px, #efefef 16px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 48, opacity: 0.7 }}>Funds</div>
              <button
                type="button"
                onClick={fetchBaseUsdcBalance}
                disabled={fundsLoading || !addressString}
                style={{
                  border: `2px solid ${FOREGROUND}`,
                  color: FOREGROUND,
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 24,
                  backgroundColor: "transparent",
                  cursor: fundsLoading || !addressString ? "not-allowed" : "pointer",
                  opacity: fundsLoading || !addressString ? 0.5 : 1,
                }}
                title="Refresh balance"
              >
                {fundsLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ position: "relative", width: 72, height: 72, display: "inline-block" }}>
                <Image src="/images/base-logo.png" alt="Base" fill style={{ objectFit: "contain" }} />
              </span>
              <div style={{ fontSize: 28, fontWeight: 800, opacity: 0.7 }}>USDC on Base</div>
            </div>
            <div style={{ fontSize: 96, fontWeight: 900 }}>
              {usdcBase ? `$${usdcBase}` : fundsLoading ? "…" : "$—.—"}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={openOnramp}
              disabled={onrampLoading}
              style={{
                backgroundColor: ACCENT,
                color: "#ffffff",
                padding: "12px 18px",
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 24,
                textDecoration: "none",
                boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
                cursor: onrampLoading ? "wait" : "pointer",
                opacity: onrampLoading ? 0.8 : 1,
              }}
              aria-label="Onramp funds via Coinbase Pay sandbox"
              title="Opens Coinbase Pay sandbox in a new tab"
            >
              {onrampLoading ? "Opening…" : "Add Funds (Sandbox)"}
            </button>
          </div>
          <div style={{ fontSize: 28, color: "#d00", fontWeight: 700, textAlign: "right", minHeight: 36 }}>
            {onrampError || ""}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {!isLoading ? (
              <AuthButton
                style={{
                  backgroundColor: ACCENT,
                  color: "#ffffff",
                  padding: "12px 18px",
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 24,
                  textDecoration: "none",
                  boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
                  transition: "transform 200ms ease, box-shadow 200ms ease",
                }}
              />
            ) : (
              <div
                style={{
                  border: `2px solid ${FOREGROUND}`,
                  color: FOREGROUND,
                  padding: "12px 18px",
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: 24,
                  backgroundColor: "transparent",
                }}
              >
                Loading…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


