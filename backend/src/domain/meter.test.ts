// Unit tests for the canonical METER item shape. The minute path must stay
// byte-identical when the new (like) overrides are absent; the like path must
// produce a distinct SK + idempotency key while keeping type/GSI1/amount intact.
import { test } from "node:test";
import assert from "node:assert/strict";
import { meterEventItem } from "./meter.ts";

const base = {
  accountId: "user-1",
  trackId: "track-9",
  artistId: "artist-7",
  amountCents: 1,
};

test("minute path: no overrides yields EVT#<minute>#<track> and default idempotency key", () => {
  const minute = 28000000;
  const item = meterEventItem({ ...base, amountCents: 1, minuteEpoch: minute }, minute);

  assert.equal(item.SK?.S, `EVT#${minute}#track-9`);
  assert.equal(item.idempotencyKey?.S, `user-1#track-9#${minute}`);
  assert.equal(item.PK?.S, "USER#user-1");
  assert.equal(item.type?.S, "METER");
  assert.equal(item.minuteEpoch?.N, String(minute));
  // GSI1 reverse lookup intact, keyed by minute (unchanged by the overrides).
  assert.equal(item.GSI1PK?.S, "ARTIST#artist-7");
  assert.equal(item.GSI1SK?.S, `EVT#${minute}#user-1`);
});

test("like path: skSuffix + idempotencyKey override SK and key, keeping type/GSI1/amount", () => {
  const minute = 28000000;
  const item = meterEventItem(
    {
      ...base,
      amountCents: 1,
      minuteEpoch: minute,
      idempotencyKey: "u#t#like",
      skSuffix: "like",
    },
    minute,
  );

  assert.equal(item.SK?.S, "EVT#like#track-9");
  assert.equal(item.idempotencyKey?.S, "u#t#like");
  assert.equal(item.amountCents?.N, "1");
  assert.equal(item.type?.S, "METER");
  assert.equal(item.minuteEpoch?.N, String(minute));
  // GSI1 stays intact (reverse lookup still keyed by minute, not the suffix).
  assert.equal(item.GSI1PK?.S, "ARTIST#artist-7");
  assert.equal(item.GSI1SK?.S, `EVT#${minute}#user-1`);
});
