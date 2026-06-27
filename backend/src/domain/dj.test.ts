import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext } from "./dj.ts";

test("pickNext skips already-played tracks", () => {
  const got = pickNext([{ trackId: "a", score: 0.1 }, { trackId: "b", score: 0.2 }], new Set(["a"]));
  assert.equal(got, "b");
});

test("pickNext returns null when all played", () => {
  assert.equal(pickNext([{ trackId: "a", score: 0.1 }], new Set(["a"])), null);
});

test("pickNext returns first unplayed in score order", () => {
  const got = pickNext(
    [{ trackId: "x", score: 0.9 }, { trackId: "y", score: 0.8 }, { trackId: "z", score: 0.7 }],
    new Set(["x", "z"]),
  );
  assert.equal(got, "y");
});

test("pickNext returns first candidate when played set is empty", () => {
  const got = pickNext([{ trackId: "a", score: 0.5 }, { trackId: "b", score: 0.3 }], new Set());
  assert.equal(got, "a");
});

test("pickNext returns null for empty candidates", () => {
  assert.equal(pickNext([], new Set()), null);
});
