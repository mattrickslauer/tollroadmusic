import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidRateMillicents,
  MAX_RATE_MILLICENTS,
  stripeCentsToMillicents,
  millicentsToStripeCents,
} from "./billing.ts";

test("rate validation: accepts 0 (free), on-step values, and the cap", () => {
  assert.equal(isValidRateMillicents(0), true);
  assert.equal(isValidRateMillicents(500), true);          // 0.5¢/min
  assert.equal(isValidRateMillicents(MAX_RATE_MILLICENTS), true);
});
test("rate validation: rejects negative, over-cap, off-step, non-integer", () => {
  assert.equal(isValidRateMillicents(-100), false);
  assert.equal(isValidRateMillicents(MAX_RATE_MILLICENTS + 100), false);
  assert.equal(isValidRateMillicents(150), false);         // off 100-step
  assert.equal(isValidRateMillicents(50.5), false);
  assert.equal(isValidRateMillicents("100"), false);
});

test("stripeCentsToMillicents: 1000 cents → 1_000_000 millicents", () => {
  assert.equal(stripeCentsToMillicents(1000), 1_000_000);
});
test("millicentsToStripeCents: 1_000_000 millicents → 1000 cents", () => {
  assert.equal(millicentsToStripeCents(1_000_000), 1000);
});
test("millicentsToStripeCents: rounds sub-cent amounts up", () => {
  assert.equal(millicentsToStripeCents(1500), 2); // 1.5¢ → 2¢
  assert.equal(millicentsToStripeCents(1499), 1); // 1.499¢ → 1¢
});
