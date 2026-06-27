import { test } from "node:test";
import assert from "node:assert/strict";
import { toVectorLiteral, vectorConfigured } from "./vectordb.ts";

test("toVectorLiteral formats a pgvector literal", () => {
  assert.equal(toVectorLiteral([0.1, 0.2, -0.3]), "[0.1,0.2,-0.3]");
});

test("vectorConfigured is false without host env", () => {
  delete process.env.TOLLROAD_VECTOR_HOST;
  assert.equal(vectorConfigured(), false);
});
