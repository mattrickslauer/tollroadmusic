import { test } from "node:test";
import assert from "node:assert/strict";
import { BP_PER_MINUTE, TIERS, resolveTier, nextTier, progressToNext } from "./bondConfig.ts";

test("BP_PER_MINUTE + TIERS match the shared contract", () => {
  assert.equal(BP_PER_MINUTE, 1);
  assert.deepEqual(
    TIERS.map((t) => [t.name, t.at]),
    [
      ["Listener", 0],
      ["Regular", 30],
      ["Fan", 120],
      ["Superfan", 480],
      ["Devotee", 1500],
    ],
  );
});

test("resolveTier returns the highest threshold met", () => {
  assert.deepEqual(resolveTier(0), { name: "Listener", index: 0 });
  assert.deepEqual(resolveTier(29), { name: "Listener", index: 0 });
  assert.deepEqual(resolveTier(30), { name: "Regular", index: 1 });
  assert.deepEqual(resolveTier(119), { name: "Regular", index: 1 });
  assert.deepEqual(resolveTier(120), { name: "Fan", index: 2 });
  assert.deepEqual(resolveTier(480), { name: "Superfan", index: 3 });
  assert.deepEqual(resolveTier(1500), { name: "Devotee", index: 4 });
  assert.deepEqual(resolveTier(99999), { name: "Devotee", index: 4 });
});

test("resolveTier clamps negatives to the bottom tier", () => {
  assert.deepEqual(resolveTier(-5), { name: "Listener", index: 0 });
});

test("nextTier names the tier above, null at the top", () => {
  assert.deepEqual(nextTier(0), { name: "Regular", at: 30 });
  assert.deepEqual(nextTier(120), { name: "Superfan", at: 480 });
  assert.equal(nextTier(1500), null);
  assert.equal(nextTier(2000), null);
});

test("progressToNext is 0..1 within a tier and 1 at the top", () => {
  assert.equal(progressToNext(0), 0);
  assert.equal(progressToNext(15), 0.5); // halfway from 0 -> 30
  assert.equal(progressToNext(30), 0); // just entered Regular
  assert.equal(progressToNext(75), 0.5); // halfway from 30 -> 120
  assert.equal(progressToNext(1500), 1); // top tier
  assert.equal(progressToNext(3000), 1); // beyond top tier still clamps to 1
});
