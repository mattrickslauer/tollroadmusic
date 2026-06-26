// Superfan Bond handlers. `bond`, `leaderboard` and `myBonds` require a session;
// `profile` is PUBLIC (a shareable profile page by handle). Tier/BP math lives in
// the domain layer — handlers only validate input and shape the HTTP response.
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import {
  getBond,
  getLeaderboard,
  getMyBonds,
  getProfileBonds,
} from "../domain/superfan.ts";

export const bond: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const session = await requireSession(req);
  const artistId = req.params.artistId;
  if (!artistId) return error(400, "artistId required");
  const data = await getBond(session.sub, artistId);
  if (!data) return error(404, "no such artist");
  return ok(data);
};

export const leaderboard: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  await requireSession(req);
  const artistId = req.params.artistId;
  if (!artistId) return error(400, "artistId required");
  const limit = clampLimit(req.query.limit);
  return ok(await getLeaderboard(artistId, limit));
};

export const myBonds: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const session = await requireSession(req);
  return ok(await getMyBonds(session.sub));
};

// Public — no session. Shows a listener's bonds on their shareable profile.
export const profile: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const handle = req.params.handle;
  if (!handle) return error(400, "handle required");
  const data = await getProfileBonds(handle);
  if (!data) return error(404, "no such profile");
  return ok(data);
};

/** Parse ?limit= into 1..100, defaulting to 50 for missing/invalid input. */
function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, Math.floor(n)));
}
