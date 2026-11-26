import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resend, ResendError } from "../lib/resend.ts";
import { sendOtpEmail, emailConfigured } from "./email.ts";

type Step = [status: number, json: unknown, retryAfter?: number];

// Replies in turn from `script`. Records every request and every wait.
function scripted(script: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const waits: number[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const [status, json, retryAfter] = script[Math.min(calls.length, script.length - 1)]!;
    calls.push({ url, init });
    const headers = new Headers(retryAfter == null ? {} : { "retry-after": String(retryAfter) });
    return { ok: status >= 200 && status < 300, status, headers, json: async () => json };
  }) as unknown as typeof fetch;
  const sleep = async (ms: number) => {
    waits.push(ms);
  };
  return { calls, waits, fetch: f, client: resend("re_key", f, { sleep }) };
}
const body = (c: { init: RequestInit }) => JSON.parse(c.init.body as string);
const email = { idempotencyKey: "otp_1", from: "a@b.dev", to: "ana@example.com", subject: "s", text: "t" };

const saved = { key: process.env.RESEND_API_KEY, from: process.env.TOLLROAD_MAIL_FROM };
afterEach(() => {
  for (const [k, v] of [["RESEND_API_KEY", saved.key], ["TOLLROAD_MAIL_FROM", saved.from]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("resend: posts JSON with a bearer key, idempotency key in the header only", async () => {
  const { calls, client } = scripted([[200, { id: "em_1" }]]);
  assert.deepEqual(await client.send(email), { id: "em_1" });
  assert.equal(calls[0]!.url, "https://api.resend.com/emails");
  const h = calls[0]!.init.headers as Record<string, string>;
  assert.equal(h.authorization, "Bearer re_key");
  assert.equal(h["idempotency-key"], "otp_1");
  assert.deepEqual(body(calls[0]!), { from: "a@b.dev", to: "ana@example.com", subject: "s", text: "t" });
});

test("resend: retries 429 with the same body, capping retry-after at 2 s", async () => {
  const { calls, waits, client } = scripted([[429, {}, 30], [200, { id: "em_2" }]]);
  await client.send(email);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.init.body, calls[0]!.init.body);
  assert.deepEqual(waits, [2000]);
});

test("resend: gives up after two retries; other errors are not retried", async () => {
  const limited = scripted([[429, { message: "rate limited" }]]);
  await assert.rejects(() => limited.client.send(email), (e) => e instanceof ResendError && e.status === 429);
  assert.equal(limited.calls.length, 3);
  const bad = scripted([[422, { message: "bad address" }]]);
  await assert.rejects(() => bad.client.send(email), (e) => e instanceof ResendError && e.message === "bad address");
  assert.equal(bad.calls.length, 1);
});

test("sendOtpEmail: logs instead of sending when RESEND_API_KEY is unset", async (t) => {
  delete process.env.RESEND_API_KEY;
  const log = t.mock.method(console, "log", () => {});
  const { calls, fetch } = scripted([[200, {}]]);
  await sendOtpEmail("ana@example.com", "123456", fetch);
  assert.equal(emailConfigured(), false);
  assert.equal(calls.length, 0);
  assert.match(String(log.mock.calls[0]!.arguments[0]), /123456/);
});

test("sendOtpEmail: sends text + html from the default or TOLLROAD_MAIL_FROM", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.TOLLROAD_MAIL_FROM;
  const { calls, fetch } = scripted([[200, { id: "em_3" }]]);
  await sendOtpEmail("ana@example.com", "123456", fetch);
  assert.equal(emailConfigured(), true);
  const b = body(calls[0]!);
  assert.equal(b.from, "Tollroad Music <tollroad@mattrickslauer.com>");
  assert.equal(b.to, "ana@example.com");
  assert.equal(b.subject, "Your TollRoad sign-in code: 123456");
  assert.match(b.text, /123456/);
  assert.match(b.html, /123456/);

  process.env.TOLLROAD_MAIL_FROM = "TollRoad <hi@justonebranch.com>";
  await sendOtpEmail("ana@example.com", "123456", fetch);
  assert.equal(body(calls[1]!).from, "TollRoad <hi@justonebranch.com>");
});

test("sendOtpEmail: throws when Resend rejects, so otpStart returns 502", async () => {
  process.env.RESEND_API_KEY = "re_test";
  const { fetch } = scripted([[403, { message: "domain not verified" }]]);
  await assert.rejects(() => sendOtpEmail("ana@example.com", "123456", fetch), ResendError);
});
