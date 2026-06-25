import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BP_PER_MINUTE,
  TIERS,
  bondPointsFromMinutes,
  resolveTier,
  nextTier,
  progressToNext,
  streakDays,
} from "./bondMath.ts";

test("BP_PER_MINUTE is 1", () => {
  assert.equal(BP_PER_MINUTE, 1);
});

test("bondPointsFromMinutes: zero, normal, fractional floored, negative", () => {
  assert.equal(bondPointsFromMinutes(0), 0);
  assert.equal(bondPointsFromMinutes(45), 45);
  assert.equal(bondPointsFromMinutes(45.9), 45);
  assert.equal(bondPointsFromMinutes(-5), 0);
});

test("resolveTier at exact boundaries and above", () => {
  assert.deepEqual(resolveTier(0), { name: "Listener", index: 0 });
  assert.deepEqual(resolveTier(29), { name: "Listener", index: 0 });
  assert.deepEqual(resolveTier(30), { name: "Regular", index: 1 });
  assert.deepEqual(resolveTier(120), { name: "Fan", index: 2 });
  assert.deepEqual(resolveTier(479), { name: "Fan", index: 2 });
  assert.deepEqual(resolveTier(480), { name: "Superfan", index: 3 });
  assert.deepEqual(resolveTier(1500), { name: "Devotee", index: 4 });
  assert.deepEqual(resolveTier(99999), { name: "Devotee", index: 4 });
});

test("nextTier mid-tier and at-top returns null", () => {
  assert.deepEqual(nextTier(0), { name: "Regular", at: 30 });
  assert.deepEqual(nextTier(50), { name: "Fan", at: 120 });
  assert.deepEqual(nextTier(480), { name: "Devotee", at: 1500 });
  assert.equal(nextTier(1500), null);
  assert.equal(nextTier(5000), null);
});

test("progressToNext: 0, mid, at-boundary, top -> 1", () => {
  // Listener->Regular spans 0..30
  assert.equal(progressToNext(0), 0);
  assert.equal(progressToNext(15), 0.5);
  // Exactly at a boundary = start of the next tier's span = 0
  assert.equal(progressToNext(30), 0);
  // Fan->Superfan spans 120..480, at 300 => 180/360 = 0.5
  assert.equal(progressToNext(300), 0.5);
  // Top tier always 1
  assert.equal(progressToNext(1500), 1);
  assert.equal(progressToNext(9000), 1);
});

test("streakDays: today only = 1", () => {
  assert.equal(streakDays([100], 100), 1);
});

test("streakDays: today + yesterday = 2", () => {
  assert.equal(streakDays([100, 99], 100), 2);
});

test("streakDays: gap breaks it", () => {
  // listened today and 98, but not 99 -> only today counts
  assert.equal(streakDays([100, 98, 97], 100), 1);
});

test("streakDays: yesterday but not today still counts", () => {
  assert.equal(streakDays([99, 98], 100), 2);
});

test("streakDays: neither today nor yesterday = 0", () => {
  assert.equal(streakDays([98, 97], 100), 0);
});

test("streakDays: empty = 0", () => {
  assert.equal(streakDays([], 100), 0);
});

test("streakDays: unsorted input handled", () => {
  assert.equal(streakDays([98, 100, 99], 100), 3);
});

test("TIERS thresholds are as specified", () => {
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
