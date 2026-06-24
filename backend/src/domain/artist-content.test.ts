import { test } from "node:test";
import assert from "node:assert/strict";
import { extForContentType, buildImageKey } from "./artist-content.ts";

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
