import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, parseConstraints, rankBySimilarity } from "./discovery.ts";

test("cosineSimilarity of identical vectors ≈ 1", () => {
  const v = [1, 2, 3, 4];
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9);
});

test("cosineSimilarity of orthogonal vectors = 0", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity of zero vector returns 0", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
});

test("parseConstraints defaults limit to 10", () => {
  const { limit } = parseConstraints({ vibe: "chill" });
  assert.equal(limit, 10);
});

test("parseConstraints clamps limit to 50", () => {
  const { limit } = parseConstraints({ vibe: "chill", limit: 999 });
  assert.equal(limit, 50);
});

test("parseConstraints clamps limit minimum to 1", () => {
  const { limit } = parseConstraints({ vibe: "chill", limit: 0 });
  assert.equal(limit, 1);
});

test("parseConstraints handles missing vibe as empty string", () => {
  const { vibe } = parseConstraints({ limit: 5 });
  assert.equal(vibe, "");
});

test("rankBySimilarity orders by similarity desc", () => {
  const queryVec = [1, 0, 0];
  const candidates = [
    { trackId: "a", embedding: [0, 1, 0] }, // orthogonal = 0
    { trackId: "b", embedding: [1, 1, 0] }, // ~0.707
    { trackId: "c", embedding: [1, 0, 0] }, // 1
  ];
  const results = rankBySimilarity(queryVec, candidates, 3);
  assert.equal(results[0].trackId, "c");
  assert.equal(results[1].trackId, "b");
  assert.equal(results[2].trackId, "a");
  assert.ok(results[0].score > results[1].score);
  assert.ok(results[1].score > results[2].score);
});

test("rankBySimilarity respects limit", () => {
  const queryVec = [1, 0];
  const candidates = [
    { trackId: "a", embedding: [1, 0] },
    { trackId: "b", embedding: [0, 1] },
    { trackId: "c", embedding: [1, 1] },
  ];
  const results = rankBySimilarity(queryVec, candidates, 2);
  assert.equal(results.length, 2);
});

test("rankBySimilarity score is cosine similarity (0..1, higher = more similar)", () => {
  const queryVec = [1, 0];
  const candidates = [
    { trackId: "same", embedding: [1, 0] },
    { trackId: "orth", embedding: [0, 1] },
  ];
  const results = rankBySimilarity(queryVec, candidates, 2);
  const same = results.find((r) => r.trackId === "same")!;
  const orth = results.find((r) => r.trackId === "orth")!;
  assert.ok(Math.abs(same.score - 1) < 1e-9, "identical direction should score ≈ 1");
  assert.ok(Math.abs(orth.score - 0) < 1e-9, "orthogonal should score = 0");
});
