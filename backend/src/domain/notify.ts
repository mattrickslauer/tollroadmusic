// Ping a Telegram group (or DMs) on noteworthy events — new sign-ups and
// successful wallet top-ups. Modeled on domain/email.ts: reads config from env
// once, and no-ops with a console log when unconfigured so local dev /
// unprovisioned envs don't fail the request.
//
// Setup: add the bot (@tollroad_noti_bot) to a Telegram group, then set
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (the group's negative chat id;
// comma-separated to fan out to several chats).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function notifyConfigured(): boolean {
  return Boolean(TOKEN) && CHAT_IDS.length > 0;
}

function fmt(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

// Fire-and-(internally)-forget: never throws, so a Telegram outage can't break
// the request that triggered it. Callers should still await it — under Lambda
// the event loop is frozen once the handler returns.
async function send(text: string): Promise<void> {
  if (!TOKEN || CHAT_IDS.length === 0) {
    console.log("[notify]", text.replace(/\n/g, " | "), "(Telegram unconfigured)");
    return;
  }
  await Promise.all(
    CHAT_IDS.map((chatId) =>
      fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      })
        .then(async (r) => {
          if (!r.ok) console.error(`[notify] telegram ${chatId} failed: ${r.status} ${await r.text()}`);
        })
        .catch((e) => console.error(`[notify] telegram ${chatId} error:`, e)),
    ),
  );
}

export type SignupKind = "user" | "artist";

export function notifySignup(kind: SignupKind, detail: Record<string, unknown>): Promise<void> {
  return send(`🎵 New TollRoad ${kind} sign-up\n${fmt(detail)}`);
}

export function notifyPayment(detail: Record<string, unknown>): Promise<void> {
  return send(`💰 TollRoad payment received\n${fmt(detail)}`);
}
