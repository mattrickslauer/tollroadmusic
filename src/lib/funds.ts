'use client'

export function normalizeAddressInput(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "address" in (value as any) && typeof (value as any).address === "string") {
    return (value as any).address as string;
  }
  if (value && typeof value === "object" && "evmAddress" in (value as any) && typeof (value as any).evmAddress === "string") {
    return (value as any).evmAddress as string;
  }
  return "";
}

function zeroPad64(hex: string) {
  const s = hex.replace(/^0x/, "");
  return s.padStart(64, "0");
}

function toLower(addr: string) {
  if (!addr) return "";
  return addr.toLowerCase();
}

function formatUsdcFromHex(hex: string) {
  let v = BigInt(0);
  try {
    v = BigInt(hex);
  } catch {}
  const million = BigInt(1000000);
  const units = v / million;
  const fraction = v % million;
  const fractionStr = fraction.toString().padStart(6, "0").slice(0, 2);
  return `${units.toString()}.${fractionStr}`;
}

export async function getBaseUsdcBalanceUsd(address: string) {
  if (!address) return "";
  const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const selector = "0x70a08231";
  const data = selector + zeroPad64(toLower(address).replace(/^0x/, ""));
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [
      { to: usdc, data },
      "latest"
    ]
  };
  try {
    const r = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    const hex = j && j.result ? j.result : "0x0";
    return formatUsdcFromHex(hex);
  } catch {
    return "";
  }
}


