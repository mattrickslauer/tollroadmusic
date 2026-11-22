// Tell the owner about noteworthy events — new sign-ups and successful wallet
// top-ups. Like domain/email.ts, it no-ops with a console log when unconfigured
// so local dev / unprovisioned envs don't fail the request.
//
// Delivery goes through Notify (notify.mattrickslauer.com): one POST per event,
// and Notify fans it out to whichever recipients are subscribed to that event
// name. Routing lives in Notify, not here — this code never names a chat.
//
// Events:
//   tollroad.signup.user     a listener account claimed for the first time
//   tollroad.signup.artist   an artist profile created
//   tollroad.sale.topup      a wallet top-up credited (Stripe webhook)
//
// Fallback: if NOTIFY_KEY is unset, or the Notify call fails (network error,
// 5 s timeout, non-2xx), the message goes the old way — straight to Telegram
// via TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (comma-separated for several chats).

export const NOTIFY_URL = "https://notify.mattrickslauer.com/api/v1/send";
const NOTIFY_TIMEOUT_MS = 5000;

export interface NotifyEnv {
  NOTIFY_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

type Fetch = typeof fetch;

function chatIds(env: NotifyEnv): string[] {
  return (env.TELEGRAM_CHAT_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function notifyConfigured(env: NotifyEnv = process.env): boolean {
  return Boolean(env.NOTIFY_KEY) || (Boolean(env.TELEGRAM_BOT_TOKEN) && chatIds(env).length > 0);
}

function fmt(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

// One Notify call. Resolves true on a 2xx, false on anything else (logged).
async function viaNotify(key: string, event: string, text: string, fetchImpl: Fetch): Promise<boolean> {
  try {
    const r = await fetchImpl(NOTIFY_URL, {
      method: "POST",
      headers: { "x-notify-key": key, "content-type": "application/json" },
      body: JSON.stringify({ event, text: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    if (r.ok) return true;
    console.error(`[notify] notify ${event} failed: ${r.status} ${await r.text().catch(() => "")}`);
  } catch (e) {
    console.error(`[notify] notify ${event} error:`, e);
  }
  return false;
}

// The old path, unchanged: the same token and chat(s) as before Notify.
async function viaTelegram(env: NotifyEnv, text: string, fetchImpl: Fetch): Promise<void> {
  await Promise.all(
    chatIds(env).map((chatId) =>
      fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
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

// Fire-and-(internally)-forget: never throws, so a notification outage can't
// break the request that triggered it. Callers should still await it — under
// Lambda the event loop is frozen once the handler returns.
export async function send(
  event: string,
  text: string,
  env: NotifyEnv = process.env,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  if (env.NOTIFY_KEY && (await viaNotify(env.NOTIFY_KEY, event, text, fetchImpl))) return;
  if (!env.TELEGRAM_BOT_TOKEN || chatIds(env).length === 0) {
    console.log("[notify]", event, text.replace(/\n/g, " | "), "(not delivered: no Notify, Telegram unconfigured)");
    return;
  }
  await viaTelegram(env, text, fetchImpl);
}

export type SignupKind = "user" | "artist";

export function notifySignup(kind: SignupKind, detail: Record<string, unknown>): Promise<void> {
  return send(`tollroad.signup.${kind}`, `🎵 New TollRoad ${kind} sign-up\n${fmt(detail)}`);
}

export function notifyPayment(detail: Record<string, unknown>): Promise<void> {
  return send("tollroad.sale.topup", `💰 TollRoad payment received\n${fmt(detail)}`);
}
