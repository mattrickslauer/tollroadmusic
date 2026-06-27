// POST /v1/discover { vibe, limit? }
// Embeds the natural-language "vibe", runs app-side cosine similarity over track
// vectors stored in DynamoDB (TVEC partition), then hydrates each trackId into a
// full CatalogTrack via getCatalog().
import { type Handler, ok, error } from "../lib/http.ts";
import { vectorConfigured, getAllTrackVectors } from "../domain/vector-store.ts";
import { embed } from "../lib/embeddings.ts";
import { getCatalog, type CatalogTrack } from "../domain/catalog.ts";
import { parseConstraints, rankBySimilarity } from "../domain/discovery.ts";

/** Shared discovery helper: embed vibe → DynamoDB cosine search → hydrated CatalogTrack list.
 *  Called by both the /discover handler and the DJ session endpoints.
 *  Callers are responsible for the vectorConfigured() guard before calling this. */
export async function runDiscovery(
  vibe: string,
  opts: { limit?: number } = {},
): Promise<Array<CatalogTrack & { score: number }>> {
  const { limit } = parseConstraints({ vibe, limit: opts.limit });

  // 1. Embed the vibe string → 1024-dim vector via Bedrock Titan v2
  const queryVec = await embed(vibe);

  // 2. Load all track vectors from DynamoDB (TVEC partition, paginated)
  const candidates = await getAllTrackVectors();

  // 3. Rank by cosine similarity (higher = more similar)
  const ranked = rankBySimilarity(queryVec, candidates, limit);

  // 4. Hydrate trackIds into CatalogTrack objects via the catalog.
  //    Build a Map for O(1) lookup; preserve vector-ranked order; drop unknown ids.
  const catalog = await getCatalog();
  const trackMap = new Map<string, CatalogTrack>(
    catalog.tracks.map((t) => [t.id, t]),
  );

  const results: Array<CatalogTrack & { score: number }> = [];
  for (const { trackId, score } of ranked) {
    const track = trackMap.get(trackId);
    if (track) results.push({ ...track, score });
  }

  return results;
}

export const discover: Handler = async (req) => {
  if (!vectorConfigured()) return error(503, "vector search not configured");

  const b = (req.body ?? {}) as Record<string, unknown>;
  const vibe = typeof b.vibe === "string" ? b.vibe.trim() : "";
  if (!vibe) return error(400, "vibe required");

  const results = await runDiscovery(vibe, {
    limit: typeof b.limit === "number" ? b.limit : undefined,
  });

  return ok({ results });
};
