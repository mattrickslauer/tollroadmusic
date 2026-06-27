import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTitanBody, parseTitanResponse } from "./embeddings.ts";

test("buildTitanBody requests 1024 dims", () => {
  assert.deepEqual(JSON.parse(buildTitanBody("calm jazz")), { inputText: "calm jazz", dimensions: 1024, normalize: true });
});

test("parseTitanResponse extracts the embedding array", () => {
  assert.deepEqual(parseTitanResponse({ embedding: [1, 2, 3] }), [1, 2, 3]);
});
