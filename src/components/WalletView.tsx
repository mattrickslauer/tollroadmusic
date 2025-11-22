'use client'

import { useEffect, useState } from "react";
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
    fundsLoading
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
    params.set("presetFiatAmount", "10");
    return `${base}?${params.toString()}`;
  }

  async function openOnramp() {
    const token = await requestOnrampSessionToken();
    if (!token) return;
    const url = buildSandboxOnrampUrl(token);
    window.open(url, "_blank", "noopener");
  }

  useEffect(function syncBaseUsdc() {
    if (!open || !isSignedIn || !addressString) {
      setUsdcBase("");
      return;
    }
    fetchBaseUsdcBalance();
  }, [open, isSignedIn, addressString]);

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
          <div style={{ fontSize: 36, fontWeight: 900 }}>Wallet</div>
          <button
            type="button"
            onClick={handleCloseButton}
            style={{
              border: `2px solid ${FOREGROUND}`,
              color: FOREGROUND,
              padding: "8px 12px",
              borderRadius: 10,
              fontWeight: 800,
              backgroundColor: "transparent",
              cursor: "pointer",
            }}
            aria-label="Close wallet"
          >
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 24, opacity: 0.7 }}>Address</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>
                {formatAddress(addressString) || "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={copyAddress}
              disabled={!addressString}
              style={{
                border: `2px solid ${FOREGROUND}`,
                color: FOREGROUND,
                padding: "10px 16px",
                borderRadius: 10,
                fontWeight: 800,
                backgroundColor: "transparent",
                cursor: addressString ? "pointer" : "not-allowed",
                opacity: addressString ? 1 : 0.5,
              }}
              title={addressString ? `Copy ${addressString}` : "No address"}
            >
              {copied ? "Copied" : "Copy Address"}
            </button>
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
            <div style={{ fontSize: 24, opacity: 0.7 }}>Funds</div>
            <div style={{ fontSize: 48, fontWeight: 900 }}>
              {usdcBase ? `$${usdcBase}` : "$—.—"}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={openOnramp}
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
              aria-label="Onramp funds via Coinbase Pay sandbox"
              title="Opens Coinbase Pay sandbox in a new tab"
            >
              Add Funds (Sandbox)
            </button>
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


