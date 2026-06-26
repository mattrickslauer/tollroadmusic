import { test } from "node:test";
import assert from "node:assert/strict";
import { extForContentType, buildImageKey, sanitizeProfile } from "./artist-content.ts";
import { isValidRateMillicents } from "./billing.ts";

test("extForContentType allows png/jpeg/webp only", () => {
  assert.equal(extForContentType("image/png"), "png");
  assert.equal(extForContentType("image/jpeg"), "jpg");
  assert.equal(extForContentType("image/webp"), "webp");
  assert.equal(extForContentType("image/gif"), null);
  assert.equal(extForContentType("text/html"), null);
});

test("buildImageKey is prefix-scoped and deterministic in shape", () => {
  const k = buildImageKey("track-covers", "t1", "jpg", "abcd");
  assert.equal(k, "track-covers/t1-abcd.jpg");
  assert.ok(k.startsWith("track-covers/"));
});

test("sanitizeProfile passes valid fields and trims", () => {
  const out = sanitizeProfile({ bio: " hi ", website: "https://a.com", genre: "Jazz", location: "NYC" });
  assert.deepEqual(out, { bio: "hi", website: "https://a.com", genre: "Jazz", location: "NYC" });
});
test("sanitizeProfile rejects non-http website", () => {
  assert.throws(() => sanitizeProfile({ website: "javascript:alert(1)" }), /website/i);
});
test("sanitizeProfile ignores unknown keys and empty object", () => {
  assert.deepEqual(sanitizeProfile({ foo: "x" } as any), {});
});

test("isValidRateMillicents rejects off-step / over-cap / non-integer rates", () => {
  // off-step (150 is not a multiple of 100)
  assert.equal(isValidRateMillicents(150), false);
  // over-cap (> 100000)
  assert.equal(isValidRateMillicents(200000), false);
  // non-integer
  assert.equal(isValidRateMillicents(500.5), false);
  // non-number
  assert.equal(isValidRateMillicents("500"), false);
  // free tier (0) is valid
  assert.equal(isValidRateMillicents(0), true);
  // valid on-step value
  assert.equal(isValidRateMillicents(500), true);
  // maximum allowed
  assert.equal(isValidRateMillicents(100000), true);
});
