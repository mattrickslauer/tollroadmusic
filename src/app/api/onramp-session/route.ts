import { NextResponse } from "next/server";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

function isPrivateIp(ip: string) {
  if (!ip || typeof ip !== "string") return true;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("100.")) {
    const parts = ip.split(".");
    const first = parseInt(parts[0] || "0", 10);
    const second = parseInt(parts[1] || "0", 10);
    if (first === 100 && second >= 64 && second <= 127) return true;
  }
  if (ip.startsWith("172.")) {
    const parts = ip.split(".");
    const second = parseInt(parts[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:")) return true;
  return false;
}

function getClientIp(request: Request, preferred?: string) {
  if (preferred && !isPrivateIp(preferred)) return preferred;
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.length > 0) {
    const parts = xff.split(",");
    if (parts.length > 0) {
      const ip = parts[0].trim();
      if (!isPrivateIp(ip)) return ip;
    }
  }
  const cf = request.headers.get("cf-connecting-ip");
  if (cf && cf.length > 0 && !isPrivateIp(cf)) return cf;
  const override = process.env.CDP_CLIENT_IP_OVERRIDE;
  if (override && !isPrivateIp(override)) return override;
  return "";
}

export async function POST(request: Request) {
  try {
    const apiKeyId = process.env.CDP_SECRET_KEY_ID || process.env.KEY_NAME;
    const apiKeySecret = process.env.CDP_SECRET_KEY || process.env.KEY_SECRET;
    if (!apiKeyId || !apiKeySecret) {
      console.error("onramp missing_keys");
      return NextResponse.json({ error: "missing_keys" }, { status: 500 });
    }

    const body = await request.json();
    const address = body?.address;
    const assets = Array.isArray(body?.assets) ? body.assets : ["USDC"];
    const blockchains = Array.isArray(body?.blockchains) ? body.blockchains : ["base"];
    if (!address || typeof address !== "string") {
      console.error("onramp invalid address", body);
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }

    const payload = {
      addresses: [{ address, blockchains }],
      assets,
      clientIp: getClientIp(request),
    };
    console.log("onramp payload", payload);

    const bearer = await generateJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: "POST",
      requestHost: "api.developer.coinbase.com",
      requestPath: "/onramp/v1/token",
      expiresIn: 120,
    });

    const res = await fetch("https://api.developer.coinbase.com/onramp/v1/token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await res.text().catch(function swallow() { return ""; });
    console.log("onramp response", { status: res.status, ok: res.ok, body: text });

    if (!res.ok) {
      return NextResponse.json({ error: "token_failed", detail: text }, { status: 502 });
    }

    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      console.error("onramp parse error", parseErr);
      return NextResponse.json({ error: "parse_error", detail: text }, { status: 502 });
    }

    const token = parsed?.data?.token || parsed?.token;
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "no_token", detail: text }, { status: 502 });
    }

    return NextResponse.json({ token });
  } catch (e) {
    console.error("onramp server_error", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}


