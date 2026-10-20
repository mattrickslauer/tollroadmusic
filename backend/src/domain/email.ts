// Send the OTP email via Resend's HTTP API (plain fetch, src/lib/resend.ts).
//
// RESEND_API_KEY is the only secret; the deploy reads it from SSM
// /resend/api-key. The sender defaults to "Tollroad Music
// <tollroad@mattrickslauer.com>" (a Resend-verified domain) and can be
// overridden with TOLLROAD_MAIL_FROM. When the key is unset we log the code to
// the console instead of failing, so local dev / unconfigured demos still work.
import { resend } from "../lib/resend.ts";

const DEFAULT_FROM = "Tollroad Music <tollroad@mattrickslauer.com>";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendOtpEmail(to: string, code: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[otp] code for ${to}: ${code} (RESEND_API_KEY unset — not emailed)`);
    return;
  }
  const subject = `Your TollRoad sign-in code: ${code}`;
  const text = `Your TollRoad sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px">
    <p style="font-size:15px;color:#333">Your TollRoad sign-in code is</p>
    <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:8px 0">${code}</p>
    <p style="font-size:13px;color:#888">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
  </div>`;
  const from = process.env.TOLLROAD_MAIL_FROM || DEFAULT_FROM;
  await resend(key, fetchImpl).send({ from, to, subject, text, html });
}
