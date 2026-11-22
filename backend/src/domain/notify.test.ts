// Owner notifications go to Notify by event name; when Notify can't take one
// (error, non-2xx, no key) the message goes straight to Telegram as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFY_URL, notifyConfigured, send } from "./notify.ts";

type Call = { url: string; init: RequestInit };

const DELIVERED = JSON.stringify({ id: "m1", deliveries: [{ channel: "telegram", status: "sent" }] });

function fakeFetch(notify: number | Error, telegram = 200, notifyBody = DELIVERED) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const status = url === NOTIFY_URL ? notify : telegram;
    if (status instanceof Error) throw status;
    return new Response(url === NOTIFY_URL ? notifyBody : "{}", { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const env = { NOTIFY_KEY: "nk", TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "-1, -2" };

test("a delivered event goes to Notify only, with its key and event name", async () => {
  const f = fakeFetch(200);
  await send("tollroad.sale.topup", "💰 paid\namount: $5.00", env, f.impl);
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0]!;
  assert.equal(url, NOTIFY_URL);
  assert.equal((init.headers as Record<string, string>)["x-notify-key"], "nk");
  assert.deepEqual(JSON.parse(String(init.body)), { event: "tollroad.sale.topup", text: "💰 paid\namount: $5.00" });
  assert.ok(init.signal, "the Notify call has a timeout");
});

for (const [why, notify] of [["non-2xx", 503], ["network error", new Error("down")]] as const) {
  test(`Notify ${why} falls back to every old Telegram chat`, async () => {
    const f = fakeFetch(notify);
    await send("tollroad.signup.user", "hi", env, f.impl);
    const tg = f.calls.filter((c) => c.url !== NOTIFY_URL);
    assert.deepEqual(tg.map((c) => c.url), ["https://api.telegram.org/bottok/sendMessage", "https://api.telegram.org/bottok/sendMessage"]);
    assert.deepEqual(tg.map((c) => JSON.parse(String(c.init.body)).chat_id), ["-1", "-2"]);
  });
}

test("no Notify key: straight to Telegram", async () => {
  const f = fakeFetch(200);
  await send("tollroad.signup.artist", "hi", { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "-1" }, f.impl);
  assert.deepEqual(f.calls.map((c) => c.url), ["https://api.telegram.org/bottok/sendMessage"]);
});

test("long text is cut to Notify's 2000 chars", async () => {
  const f = fakeFetch(200);
  await send("tollroad.signup.user", "x".repeat(3000), env, f.impl);
  assert.equal(JSON.parse(String(f.calls[0]!.init.body)).text.length, 2000);
});

test("nothing configured: nothing sent, nothing thrown", async () => {
  const f = fakeFetch(200);
  await send("tollroad.signup.user", "hi", {}, f.impl);
  assert.equal(f.calls.length, 0);
  assert.equal(notifyConfigured({}), false);
  assert.equal(notifyConfigured({ NOTIFY_KEY: "k" }), true);
});

for (const [why, body] of [
  ["no recipient wants the event", JSON.stringify({ id: "m2", deliveries: [] })],
  ["every delivery failed", JSON.stringify({ id: "m3", deliveries: [{ status: "failed" }, { status: "limited" }] })],
  ["the answer is not JSON", "ok"],
] as const) {
  test(`a 2xx where ${why} still falls back to Telegram`, async () => {
    const f = fakeFetch(200, 200, body);
    await send("tollroad.signup.artist", "hi", env, f.impl);
    assert.equal(f.calls.filter((c) => c.url !== NOTIFY_URL).length, 2);
  });
}

test("a queued delivery (iMessage) counts as delivered", async () => {
  const f = fakeFetch(200, 200, JSON.stringify({ deliveries: [{ status: "queued" }] }));
  await send("tollroad.sale.topup", "hi", env, f.impl);
  assert.equal(f.calls.length, 1);
});
