import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePayoutState } from "./payoutState.ts";

test("derivePayoutState maps status to UI state", () => {
  assert.equal(derivePayoutState(null), "loading");
  assert.equal(derivePayoutState({ connected: false, payoutsEnabled: false, availableMillicents: 0, history: [] }), "not-connected");
  assert.equal(derivePayoutState({ connected: true, payoutsEnabled: false, availableMillicents: 0, history: [] }), "incomplete");
  assert.equal(derivePayoutState({ connected: true, payoutsEnabled: true, availableMillicents: 5000, history: [] }), "ready");
});
