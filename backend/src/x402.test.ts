import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentRequired, X402_VERSION } from "./lib/x402.ts";
import { match } from "./router.ts";

test("paymentRequired builds a valid x402 402 body", () => {
  const res = paymentRequired({ resource: "/v1/stream/t1", trackId: "t1", pricePerMinuteCents: 4 });
  assert.equal(res.status, 402);
  const body = res.body as any;
  assert.equal(body.x402Version, X402_VERSION);
  assert.equal(body.accepts.length, 1);
  const req = body.accepts[0];
  assert.equal(req.scheme, "prepaid");
  assert.equal(req.asset, "usd");
  assert.equal(req.maxAmountRequired, 4);
  assert.equal(req.payTo, "/v1/charge");
  assert.equal(res.headers?.["Accept-Payment"], "prepaid");
});

test("router matches static and param routes", () => {
  assert.ok(match("GET", "/catalog"), "GET /catalog");
  assert.ok(match("POST", "/charge"), "POST /charge");

  const stream = match("GET", "/stream/abc-123");
  assert.ok(stream);
  assert.equal(stream!.params.trackId, "abc-123");

  const raw = match("GET", "/stream/abc/raw");
  assert.ok(raw);
  assert.equal(raw!.params.trackId, "abc");

  const plTracks = match("POST", "/playlists/p1/tracks");
  assert.ok(plTracks);
  assert.equal(plTracks!.params.playlistId, "p1");

  assert.equal(match("GET", "/nope"), null);
  assert.equal(match("PUT", "/catalog"), null, "wrong method");
});

test("router strips trailing slash", () => {
  assert.ok(match("GET", "/catalog/"));
});

test("router matches artist content routes", () => {
  assert.ok(match("POST", "/artist/avatar/presign"));
  assert.ok(match("POST", "/artist/avatar/commit"));
  assert.ok(match("POST", "/artist/cover/presign"));
  assert.ok(match("POST", "/artist/cover/commit"));
  assert.ok(match("POST", "/artist/profile"));
});
