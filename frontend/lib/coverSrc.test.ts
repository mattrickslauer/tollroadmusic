import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCoverSrc } from "./coverSrc.ts";

test("null/empty -> null (placeholder handled by caller)", () => {
  assert.equal(resolveCoverSrc(null, "https://img.cdn"), null);
  assert.equal(resolveCoverSrc("", "https://img.cdn"), null);
});
test("absolute http(s) URL passes through", () => {
  assert.equal(resolveCoverSrc("https://x/y.jpg", "https://img.cdn"), "https://x/y.jpg");
});
test("leading-slash legacy path passes through (Next static)", () => {
  assert.equal(resolveCoverSrc("/covers/cat-track-1.svg", "https://img.cdn"), "/covers/cat-track-1.svg");
});
test("bucket-relative key is prefixed with images base", () => {
  assert.equal(resolveCoverSrc("track-covers/t1.jpg", "https://img.cdn"), "https://img.cdn/track-covers/t1.jpg");
  assert.equal(resolveCoverSrc("track-covers/t1.jpg", "https://img.cdn/"), "https://img.cdn/track-covers/t1.jpg");
});
test("bucket-relative key with no base falls back to leading-slash static", () => {
  assert.equal(resolveCoverSrc("track-covers/t1.jpg", ""), "/track-covers/t1.jpg");
});
