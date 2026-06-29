// Vibe Pad mood-pad endpoints.
//   POST /v1/mood/trace            — submit a whole mood trace, score + reward.
//   GET  /v1/mood/consensus/{songId} — crowd curve + rule-based tags (ghost).
// Auth via requireSession; DSQL holds the durable traces + in-SQL consensus; the
// reward credits the EXISTING DynamoDB wallet (domain/mood.ts → billing.creditTopup).
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { getTrackBilling } from "../domain/tracks.ts";
import { submitTrace, getConsensus, GRID_MS } from "../domain/mood.ts";

/** Coerce a samples array entry to a number in [-1,1] or null (a gap). Anything
 *  out of range / non-finite becomes a gap so a bad client can't poison scores. */
function sample(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (x < -1 || x > 1) return null;
  return x;
}

export const trace: Handler = async (req) => {
  // DSQL holds the traces + consensus; a real (non-zero) reward needs the wallet
  // store (prod) or the explicit local-DSQL billing opt-in. We still accept the
  // trace and pay 0 if billing is unconfigured — the data is the point.
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "mood game not configured");
  const session = await requireSession(req);

  const b = (req.body ?? {}) as Record<string, unknown>;
  const songId = typeof b.songId === "string" ? b.songId : "";
  if (!songId) return error(400, "songId required");

  const gridMs = Number.isFinite(b.gridMs) ? Number(b.gridMs) : GRID_MS;
  if (gridMs <= 0) return error(400, "gridMs must be positive");
  const durationMs = Number.isFinite(b.durationMs) ? Number(b.durationMs) : 0;
  if (durationMs <= 0) return error(400, "durationMs must be positive");

  const samples = (b.samples ?? {}) as Record<string, unknown>;
  if (!Array.isArray(samples.v) || !Array.isArray(samples.e)) {
    return error(400, "samples.v and samples.e must be arrays");
  }
  const v = samples.v.map(sample);
  const e = samples.e.map(sample);
  if (v.length !== e.length) return error(400, "samples.v and samples.e length mismatch");

  // The grid-aligned arrays must be ~ceil(durationMs/gridMs) long (allow ±2 bins
  // of rounding slack at the song boundary).
  const expected = Math.ceil(durationMs / gridMs);
  if (v.length === 0) return error(400, "samples are empty");
  if (Math.abs(v.length - expected) > 2) {
    return error(400, `samples length ${v.length} does not match duration (~${expected} bins)`);
  }

  const track = await getTrackBilling(songId);
  if (!track) return error(404, "no such song");

  const result = await submitTrace({
    userId: session.sub,
    songId: track.id,
    gridMs,
    durationMs,
    v,
    e,
    pricePerMinuteMillicents: track.pricePerMinuteMillicents,
  });
  return ok(result);
};

export const consensus: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "mood game not configured");
  const songId = req.params.songId ?? "";
  if (!songId) return error(400, "songId required");
  return ok(await getConsensus(songId));
};
