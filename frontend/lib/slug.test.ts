import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, isUuid } from "./slug.ts";

test("slugify lowercases, drops symbols, collapses to single dashes", () => {
  assert.equal(slugify("Adhesion & Scrap Heap"), "adhesion-scrap-heap");
  assert.equal(slugify("Koji Tanaka Trio"), "koji-tanaka-trio");
  assert.equal(slugify("  Spaced   Out  "), "spaced-out");
});

test("slugify strips accents", () => {
  assert.equal(slugify("Café Münch"), "cafe-munch");
});

test("isUuid distinguishes uuid from slug", () => {
  assert.equal(isUuid("d1ea97de-63ce-5b9d-907d-190615a31847"), true);
  assert.equal(isUuid("adhesion-scrap-heap"), false);
});
