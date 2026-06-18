#!/usr/bin/env node
// TollRoad x402 agent demo.
//
// Proves that ANY programmatic client — here, an "AI agent" — can stream music
// over the crypto-free x402 protocol with nothing but HTTP:
//
//   1. GET  /v1/catalog                 → discover tracks
//   2. GET  /v1/stream/{id}             → 402 Payment Required + payment terms
//   3. POST /v1/charge { trackId }      → pay one metered minute (wallet debit)
//   4. GET  /v1/stream/{id}             → 200 + a stream grant (now authorized)
//
// Usage:
//   API_BASE=https://<api>/v1 \
//   TOLLROAD_TOKEN=<session jwt>        # end-user identity (from the app), OR
//   TOLLROAD_API_KEY=<usage-plan key>  # programmatic consumer
//   node scripts/agent-demo.mjs
//
// Defaults to the local dev API (http://localhost:8787/v1). With no funds it
// auto-tops-up via the demo-credit path (only available when Stripe is unset).

const API_BASE = (process.env.API_BASE ?? "http://localhost:8787/v1").replace(/\/$/, "");
const TOKEN = process.env.TOLLROAD_TOKEN;
const API_KEY = process.env.TOLLROAD_API_KEY;

const auth = {};
if (TOKEN) auth["authorization"] = `Bearer ${TOKEN}`;
if (API_KEY) auth["x-api-key"] = API_KEY;

const log = (emoji, msg) => console.log(`${emoji}  ${msg}`);
const usd = (c) => `$${(c / 100).toFixed(2)}`;

async function call(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...auth, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  log("🤖", `TollRoad agent connecting to ${API_BASE}`);
  if (!TOKEN && !API_KEY) {
    log("⚠️", "No TOLLROAD_TOKEN or TOLLROAD_API_KEY set — calls needing auth will 401.");
  }

  // 1. Discover the catalog.
  const cat = await call("GET", "/catalog");
  if (cat.status !== 200) {
    log("❌", `catalog → ${cat.status} ${JSON.stringify(cat.data)}`);
    process.exit(1);
  }
  const track = cat.data.tracks?.[0];
  if (!track) {
    log("❌", "catalog is empty — seed the demo data first.");
    process.exit(1);
  }
  log("🎵", `picked "${track.title}" by ${track.artistName} (${track.pricePerMinuteCents}¢/min)`);

  // 2. Try to stream without paying → expect 402 with x402 payment terms.
  const gate = await call("GET", `/stream/${track.id}`);
  if (gate.status === 402) {
    const terms = gate.data.accepts?.[0];
    log("🔒", `402 Payment Required — x402 v${gate.data.x402Version}`);
    log("  ", `pay ${terms?.maxAmountRequired}¢ via ${terms?.scheme} at ${terms?.payTo} → then retry`);
  } else if (gate.status === 200) {
    log("ℹ️", "already authorized (recent paid minute) — skipping payment");
  } else {
    log("❌", `stream gate → ${gate.status} ${JSON.stringify(gate.data)}`);
    process.exit(1);
  }

  // 3. Pay one metered minute. Auto-top-up if the wallet can't cover it.
  if (gate.status === 402) {
    let pay = await call("POST", "/charge", { trackId: track.id });
    if (pay.status === 402) {
      log("💳", "insufficient balance — topping up via demo-credit…");
      const credit = await call("POST", "/wallet/demo-credit", { method: "ach" });
      if (credit.status !== 200) {
        log("❌", `top-up failed (${credit.status}). Fund the wallet, then retry. ${JSON.stringify(credit.data)}`);
        process.exit(1);
      }
      log("  ", `wallet funded → ${usd(credit.data.balanceCents)}`);
      pay = await call("POST", "/charge", { trackId: track.id });
    }
    if (pay.status !== 200) {
      log("❌", `charge → ${pay.status} ${JSON.stringify(pay.data)}`);
      process.exit(1);
    }
    log("✅", `paid one minute — balance now ${usd(pay.data.balanceCents)}`);
  }

  // 4. Retry the stream → now authorized.
  const grant = await call("GET", `/stream/${track.id}`);
  if (grant.status !== 200) {
    log("❌", `stream retry → ${grant.status} ${JSON.stringify(grant.data)}`);
    process.exit(1);
  }
  log("🎧", `stream authorized via ${grant.data.mode} → ${String(grant.data.url).slice(0, 72)}…`);
  log("🤖", "x402 loop complete: discovered → 402 → paid → streamed. No card swipe, no chain.");
}

main().catch((err) => {
  console.error("agent-demo failed:", err);
  process.exit(1);
});
