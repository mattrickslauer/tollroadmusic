// POST /v1/discover { vibe, limit?, bpmMin?, bpmMax?, maxEnergy?, allowExplicit? }
// Embeds the natural-language "vibe", runs a pgvector ANN search over track_vectors,
// then hydrates each returned track_id into a full CatalogTrack via getCatalog().
import { type Handler, ok, error } from "../lib/http.ts";
import { vectorConfigured, vquery, toVectorLiteral } from "../lib/vectordb.ts";
import { embed } from "../lib/embeddings.ts";
import { getCatalog, type CatalogTrack } from "../domain/catalog.ts";
import { parseConstraints, buildDiscoverSql, type DiscoverBody } from "../domain/discovery.ts";

/** Shared discovery helper: embed vibe → vector ANN search → hydrated CatalogTrack list.
 *  Called by both the /discover handler and the DJ session endpoints to avoid duplication.
 *  Callers are responsible for the vectorConfigured() guard before calling this. */
export async function runDiscovery(
  vibe: string,
  opts: {
    limit?: number;
    bpmMin?: number;
    bpmMax?: number;
    maxEnergy?: number;
    allowExplicit?: boolean;
  } = {},
): Promise<Array<CatalogTrack & { score: number }>> {
  const constraints = parseConstraints({
    vibe,
    limit: opts.limit,
    bpmMin: opts.bpmMin,
    bpmMax: opts.bpmMax,
    maxEnergy: opts.maxEnergy,
    allowExplicit: opts.allowExplicit,
  } as DiscoverBody);

  // 1. Embed the vibe string → vector literal
  const embedding = await embed(vibe);
  const vectorLiteral = toVectorLiteral(embedding);

  // 2. Run pgvector ANN search — returns track_id + score (cosine distance)
  const { sql, params } = buildDiscoverSql(constraints, vectorLiteral);
  const { rows } = await vquery<{ track_id: string; score: number }>(sql, params);

  // 3. Hydrate track_ids into CatalogTrack objects via the catalog.
  //    Build a Map for O(1) lookup; preserve vector-ranked order; drop unknown ids.
  const catalog = await getCatalog();
  const trackMap = new Map<string, CatalogTrack>(
    catalog.tracks.map((t) => [t.id, t]),
  );

  const results: Array<CatalogTrack & { score: number }> = [];
  for (const row of rows) {
    const track = trackMap.get(row.track_id);
    if (track) results.push({ ...track, score: row.score });
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
    bpmMin: typeof b.bpmMin === "number" ? b.bpmMin : undefined,
    bpmMax: typeof b.bpmMax === "number" ? b.bpmMax : undefined,
    maxEnergy: typeof b.maxEnergy === "number" ? b.maxEnergy : undefined,
    allowExplicit: b.allowExplicit === true,
  });

  return ok({ results });
};
