// Pure discovery logic — no I/O or network imports.
// Cosine similarity, constraint parsing, and candidate ranking for vibe search.

/** Standard cosine similarity between two vectors. Returns 0 if either norm is 0. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Parse + sanitize the raw request body into { vibe, limit }.
 *  limit is clamped 1..50 (default 10). Missing vibe becomes an empty string. */
export function parseConstraints(body: unknown): { vibe: string; limit: number } {
  const b = body as Record<string, unknown> | null | undefined;
  const vibe = typeof b?.vibe === "string" ? b.vibe : "";
  const rawLimit = typeof b?.limit === "number" ? b.limit : 10;
  const limit = Math.max(1, Math.min(50, rawLimit));
  return { vibe, limit };
}

/** Rank `candidates` by cosine similarity to `queryVec`, descending.
 *  Returns top `limit` results with their score (0..1, higher = more similar). */
export function rankBySimilarity(
  queryVec: number[],
  candidates: Array<{ trackId: string; embedding: number[] }>,
  limit: number,
): Array<{ trackId: string; score: number }> {
  const scored = candidates.map((c) => ({
    trackId: c.trackId,
    score: cosineSimilarity(queryVec, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
