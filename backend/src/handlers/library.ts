// Library handlers — likes, playlists, recently-played. All require a session;
// ownership is enforced in the domain queries.
import { type Handler, type ApiRequest, ok, error, requireSession, HttpError } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import * as lib from "../domain/library.ts";

async function guard(req: ApiRequest) {
  if (!sessionConfigured() || !dsqlConfigured()) throw new HttpError(503, "library not configured");
  return requireSession(req);
}

function trackIdFrom(req: ApiRequest): string {
  const b = (req.body ?? {}) as Record<string, unknown>;
  return (typeof b.trackId === "string" && b.trackId) || req.query.trackId || "";
}

// --- Likes -----------------------------------------------------------------

export const getLikes: Handler = async (req) => {
  const s = await guard(req);
  const [tracks, ids] = await Promise.all([lib.listLikedTracks(s.sub), lib.likedTrackIds(s.sub)]);
  return ok({ tracks, likedIds: ids });
};

export const postLike: Handler = async (req) => {
  const s = await guard(req);
  const trackId = trackIdFrom(req);
  if (!trackId) return error(400, "trackId required");
  return ok(await lib.toggleLike(s.sub, trackId));
};

export const deleteLike: Handler = async (req) => {
  const s = await guard(req);
  const trackId = trackIdFrom(req);
  if (!trackId) return error(400, "trackId required");
  await lib.setLike(s.sub, trackId, false);
  return ok({ liked: false });
};

// --- Playlists -------------------------------------------------------------

export const getPlaylists: Handler = async (req) => {
  const s = await guard(req);
  return ok({ playlists: await lib.listPlaylists(s.sub) });
};

export const postPlaylist: Handler = async (req) => {
  const s = await guard(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name : "New playlist";
  return ok(await lib.createPlaylist(s.sub, name));
};

export const getPlaylist: Handler = async (req) => {
  const s = await guard(req);
  const id = req.params.playlistId;
  if (!id) return error(400, "playlistId required");
  const pl = await lib.getPlaylist(s.sub, id);
  if (!pl) return error(404, "no such playlist");
  return ok(pl);
};

export const deletePlaylist: Handler = async (req) => {
  const s = await guard(req);
  const id = req.params.playlistId;
  if (!id) return error(400, "playlistId required");
  const okd = await lib.deletePlaylist(s.sub, id);
  return okd ? ok({ deleted: true }) : error(404, "no such playlist");
};

export const addPlaylistTrack: Handler = async (req) => {
  const s = await guard(req);
  const id = req.params.playlistId;
  const trackId = trackIdFrom(req);
  if (!id || !trackId) return error(400, "playlistId and trackId required");
  const okd = await lib.addToPlaylist(s.sub, id, trackId);
  return okd ? ok({ added: true }) : error(404, "no such playlist");
};

export const removePlaylistTrack: Handler = async (req) => {
  const s = await guard(req);
  const id = req.params.playlistId;
  const trackId = trackIdFrom(req);
  if (!id || !trackId) return error(400, "playlistId and trackId required");
  const okd = await lib.removeFromPlaylist(s.sub, id, trackId);
  return okd ? ok({ removed: true }) : error(404, "no such playlist");
};

// --- Recently played -------------------------------------------------------

export const getRecents: Handler = async (req) => {
  const s = await guard(req);
  const limit = Number(req.query.limit) || 12;
  return ok({ tracks: await lib.recentTracks(s.sub, limit) });
};

export const postRecent: Handler = async (req) => {
  const s = await guard(req);
  const trackId = trackIdFrom(req);
  if (!trackId) return error(400, "trackId required");
  await lib.recordPlay(s.sub, trackId);
  return ok({ ok: true });
};
