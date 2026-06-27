import { test } from "node:test";
import assert from "node:assert/strict";
import { makeClient } from "./client.ts";

test("client attaches x-api-key and builds the URL", async () => {
  const calls: any[] = [];
  const fetchMock = async (url: string, init: any) => {
    calls.push({ url, init });
    return { status: 200, json: async () => ({ ok: true }) };
  };
  const c = makeClient({ base: "https://api/v1", apiKey: "k1", fetchImpl: fetchMock as any });
  await c.call("POST", "/discover", { vibe: "calm" });
  assert.equal(calls[0].url, "https://api/v1/discover");
  assert.equal(calls[0].init.headers["x-api-key"], "k1");
});

test("client attaches Bearer token when provided", async () => {
  const calls: any[] = [];
  const fetchMock = async (url: string, init: any) => {
    calls.push({ url, init });
    return { status: 200, json: async () => ({ ok: true }) };
  };
  const c = makeClient({ base: "https://api/v1", apiKey: "k1", token: "tok123", fetchImpl: fetchMock as any });
  await c.call("GET", "/balance");
  assert.equal(calls[0].init.headers["authorization"], "Bearer tok123");
  assert.equal(calls[0].init.headers["x-api-key"], "k1");
});

test("client sends body as JSON for POST", async () => {
  const calls: any[] = [];
  const fetchMock = async (url: string, init: any) => {
    calls.push({ url, init });
    return { status: 200, json: async () => ({ ok: true }) };
  };
  const c = makeClient({ base: "https://api/v1", apiKey: "k2", fetchImpl: fetchMock as any });
  await c.call("POST", "/sessions", { context: "focus music" });
  assert.equal(calls[0].init.headers["content-type"], "application/json");
  assert.equal(calls[0].init.body, JSON.stringify({ context: "focus music" }));
});

test("client returns status and parsed JSON data", async () => {
  const fetchMock = async (_url: string, _init: any) => {
    return { status: 200, json: async () => ({ balanceCents: 500 }) };
  };
  const c = makeClient({ base: "https://api/v1", apiKey: "k3", fetchImpl: fetchMock as any });
  const result = await c.call("GET", "/balance");
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { balanceCents: 500 });
});
