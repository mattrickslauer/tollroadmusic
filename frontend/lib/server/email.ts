// Server-only: send the OTP email via Amazon SES v2. Ported from sonar.
//
// Requires TOLLROAD_SES_SENDER (a verified SES identity, e.g.
// "TollRoad <login@yourdomain>"). When unset we DON'T fail — we log the code to
// the server console so local dev / unconfigured demos still work. Uses the
// ambient AWS credential chain (same as DSQL). The SES SDK is imported lazily
// (only when a sender is configured) so dev / console-fallback builds don't
// need @aws-sdk/client-sesv2 present.

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const SENDER = process.env.TOLLROAD_SES_SENDER;

/** True when SES is configured (a verified sender is set). */
export function emailConfigured(): boolean {
  return Boolean(SENDER);
}

/** Send a sign-in code. No-op-with-log when SES isn't configured. */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  if (!SENDER) {
    console.log(`[otp] code for ${to}: ${code} (TOLLROAD_SES_SENDER unset — not emailed)`);
    return;
  }
  const subject = `Your TollRoad sign-in code: ${code}`;
  const text = `Your TollRoad sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px">
    <p style="font-size:15px;color:#333">Your TollRoad sign-in code is</p>
    <p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:8px 0">${code}</p>
    <p style="font-size:13px;color:#888">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
  </div>`;
  const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
  const client = new SESv2Client({ region: REGION });
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: SENDER,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
        },
      },
    }),
  );
}
