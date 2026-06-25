// Send the OTP email via SMTP (ZeptoMail / Zoho), using nodemailer. SES is
// unusable while the account is stuck in the sandbox, so OTP mail goes out
// through ZeptoMail's transactional relay from the verified agfarms.dev domain.
//
// Everything is env-driven; only TOLLROAD_SMTP_PASS (the ZeptoMail "Send Mail"
// API token) is secret. When it's unset we log the code to the console instead
// of failing, so local dev / unconfigured demos still work.
import type { Transporter } from "nodemailer";

const SMTP_HOST = process.env.TOLLROAD_SMTP_HOST ?? "smtp.zeptomail.com";
const SMTP_PORT = Number(process.env.TOLLROAD_SMTP_PORT ?? "587");
const SMTP_USER = process.env.TOLLROAD_SMTP_USER ?? "emailapikey";
const SMTP_PASS = process.env.TOLLROAD_SMTP_PASS;
const SENDER = process.env.TOLLROAD_SMTP_SENDER ?? "TollRoad <tollroad@agfarms.dev>";

let transporter: Transporter | null = null;

async function getTransport(): Promise<Transporter> {
  if (!transporter) {
    const { createTransport } = await import("nodemailer");
    transporter = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      // Port 465 is implicit TLS; 587 upgrades via STARTTLS (secure: false).
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export function emailConfigured(): boolean {
  return Boolean(SMTP_PASS);
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!SMTP_PASS) {
    console.log(`[otp] code for ${to}: ${code} (TOLLROAD_SMTP_PASS unset — not emailed)`);
    return;
  }
  const subject = `Your TollRoad sign-in code: ${code}`;
  const text = `Your TollRoad sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px">
    <p style="font-size:15px;color:#333">Your TollRoad sign-in code is</p>
    <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:8px 0">${code}</p>
    <p style="font-size:13px;color:#888">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
  </div>`;
  const transport = await getTransport();
  await transport.sendMail({ from: SENDER, to, subject, text, html });
}
