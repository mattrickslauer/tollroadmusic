// Pure query/constraint logic for the /discover vibe-search endpoint.
// No network calls here — all side effects live in the handler.

export interface DiscoverBody {
  vibe: string;
  limit?: number;
  allowExplicit?: boolean;
}

export interface Constraints {
  limit: number;
  allowExplicit: boolean;
}

/** Parse + sanitize the raw request body into typed Constraints. */
export function parseConstraints(body: DiscoverBody): Constraints {
  const rawLimit = typeof body.limit === "number" ? body.limit : 20;
  const limit = Math.max(1, Math.min(50, rawLimit));

  return {
    limit,
    allowExplicit: body.allowExplicit === true,
  };
}

export interface DiscoverQuery {
  sql: string;
  params: unknown[];
}

/**
 * Build the pgvector ANN search SQL.
 * Returns `track_id` + cosine distance `score` from `track_vectors`.
 * The handler hydrates these into full CatalogTrack objects via getCatalog().
 *
 * @param constraints  Parsed request constraints.
 * @param vectorLiteral  The pgvector literal string, e.g. "[0.1,0.2,...]".
 */
export function buildDiscoverSql(constraints: Constraints, vectorLiteral: string): DiscoverQuery {
  const params: unknown[] = [vectorLiteral];
  const filters: string[] = [];

  if (!constraints.allowExplicit) {
    filters.push("explicit = false");
  }

  params.push(constraints.limit);
  const limitParam = `$${params.length}`;

  const whereClause =
    filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const sql = `SELECT track_id, embedding <=> $1 AS score FROM track_vectors v ${whereClause} ORDER BY v.embedding <=> $1 LIMIT ${limitParam}`;

  return { sql, params };
}
