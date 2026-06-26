// Library handlers — likes, playlists, recently-played. All require a session;
// ownership is enforced in the domain queries.
import { type Handler, type ApiRequest, ok, error, requireSession, HttpError } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import * as lib from "../domain/library.ts";
import { getTrackBilling } from "../domain/tracks.ts";
import { chargeLike, LIKE_COST_CENTS, localDsqlBilling } from "../domain/billing.ts";
import { walletStoreConfigured } from "../domain/wallet-store.ts";
import { paymentRequired } from "../lib/x402.ts";

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

// Toggle a like. Liking tips LIKE_COST_CENTS toward the song (once per track,
// ever); unliking is free and never refunds. A like with too small a balance gets
// the same x402 402 the /charge endpoint returns, so the client can prompt a top-up.
export const postLike: Handler = async (req) => {
  const s = await guard(req);
  // A like costs money, so it needs a billing backend: DynamoDB (prod) or, only
  // under the explicit local opt-in, the legacy DSQL-direct path — same gate as
  // POST /v1/charge.
  if (!walletStoreConfigured() && !localDsqlBilling()) return error(503, "billing not configured");
  const trackId = trackIdFrom(req);
  if (!trackId) return error(400, "trackId required");

  // Unlike first — if a row was removed this was an unlike: free, no track lookup.
  if (await lib.unlikeIfPresent(s.sub, trackId)) return ok({ liked: false, charged: false });

  // Otherwise it's a like, which costs money — resolve the artist for the ledger.
  const track = await getTrackBilling(trackId);
  if (!track) return error(404, "no such track");

  const result = await chargeLike({ accountId: s.sub, trackId: track.id, artistId: track.artistId });
  if (!result.ok) {
    const res = paymentRequired({
      resource: `/v1/library/likes`,
      trackId: track.id,
      pricePerMinuteCents: LIKE_COST_CENTS,
      reason: "insufficient balance",
    });
    (res.body as Record<string, unknown>).balanceCents = result.balanceCents;
    return res;
  }

  // The wallet debit already wrote the METER event transactionally (prod) or the
  // royalty_ledger row directly (local), so artist earnings update via the
  // projector — there is no separate best-effort emit to mirror anymore.
  return ok({ liked: true, charged: result.charged, balanceCents: result.balanceCents });
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

export const postPlaylistVisibility: Handler = async (req) => {
  const s = await guard(req);
  const id = req.params.playlistId;
  if (!id) return error(400, "playlistId required");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const visibility = b.visibility === "public" ? "public" : b.visibility === "private" ? "private" : null;
  if (!visibility) return error(400, "visibility must be 'public' or 'private'");
  const okd = await lib.setPlaylistVisibility(s.sub, id, visibility);
  return okd ? ok({ visibility }) : error(404, "no such playlist");
};

// Public, unauthenticated read — only returns playlists marked public.
export const getPublicPlaylist: Handler = async (req) => {
  if (!dsqlConfigured()) throw new HttpError(503, "library not configured");
  const id = req.params.playlistId;
  if (!id) return error(400, "playlistId required");
  const pl = await lib.getPublicPlaylist(id);
  if (!pl) return error(404, "no such playlist");
  return ok(pl);
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
