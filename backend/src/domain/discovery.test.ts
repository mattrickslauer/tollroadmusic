import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConstraints, buildDiscoverSql } from "./discovery.ts";

test("parseConstraints clamps limit and defaults explicit to false", () => {
  const c = parseConstraints({ vibe: "x", limit: 999 });
  assert.equal(c.limit, 50);          // clamp
  assert.equal(c.allowExplicit, false);
});

test("parseConstraints uses default limit of 20 when not provided", () => {
  const c = parseConstraints({ vibe: "chill vibes" });
  assert.equal(c.limit, 20);
  assert.equal(c.allowExplicit, false);
});

test("parseConstraints clamps limit to minimum of 1", () => {
  const c = parseConstraints({ vibe: "x", limit: 0 });
  assert.equal(c.limit, 1);
});

test("parseConstraints accepts allowExplicit: true", () => {
  const c = parseConstraints({ vibe: "x", allowExplicit: true });
  assert.equal(c.allowExplicit, true);
});

test("parseConstraints passes through optional numeric fields", () => {
  const c = parseConstraints({ vibe: "x", bpmMin: 120, bpmMax: 140, maxEnergy: 0.8 });
  assert.equal(c.bpmMin, 120);
  assert.equal(c.bpmMax, 140);
  assert.equal(c.maxEnergy, 0.8);
});

test("buildDiscoverSql filters explicit and orders by cosine distance", () => {
  const { sql, params } = buildDiscoverSql({ limit: 10, allowExplicit: false }, "[0.1,0.2]");
  assert.match(sql, /ORDER BY v\.embedding <=> \$1/);
  assert.match(sql, /explicit = false/);
  assert.deepEqual(params.slice(0, 1), ["[0.1,0.2]"]);
});

test("buildDiscoverSql omits explicit filter when allowExplicit is true", () => {
  const { sql } = buildDiscoverSql({ limit: 10, allowExplicit: true }, "[0.1,0.2]");
  assert.doesNotMatch(sql, /explicit = false/);
});

test("buildDiscoverSql includes bpmMin filter when provided", () => {
  const { sql, params } = buildDiscoverSql({ limit: 10, allowExplicit: false, bpmMin: 120 }, "[0.1]");
  assert.match(sql, /bpm >= \$\d+/);
  assert.ok(params.includes(120));
});

test("buildDiscoverSql includes bpmMax filter when provided", () => {
  const { sql, params } = buildDiscoverSql({ limit: 10, allowExplicit: false, bpmMax: 140 }, "[0.1]");
  assert.match(sql, /bpm <= \$\d+/);
  assert.ok(params.includes(140));
});

test("buildDiscoverSql includes maxEnergy filter when provided", () => {
  const { sql, params } = buildDiscoverSql({ limit: 10, allowExplicit: false, maxEnergy: 0.8 }, "[0.1]");
  assert.match(sql, /energy <= \$\d+/);
  assert.ok(params.includes(0.8));
});

test("buildDiscoverSql selects track_id and score", () => {
  const { sql } = buildDiscoverSql({ limit: 5, allowExplicit: false }, "[0.1,0.2]");
  assert.match(sql, /SELECT track_id/);
  assert.match(sql, /AS score/);
});

test("buildDiscoverSql uses LIMIT with the constraints limit", () => {
  const { sql, params } = buildDiscoverSql({ limit: 5, allowExplicit: false }, "[0.1,0.2]");
  assert.match(sql, /LIMIT \$\d+/);
  assert.ok(params.includes(5));
});
