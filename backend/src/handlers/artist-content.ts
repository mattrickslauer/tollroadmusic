import { type Handler, ok, error, requireSession, NO_STORE, HttpError } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import {
  extForContentType,
  buildImageKey,
  presignImagePut,
  imagesConfigured,
  artistIdForAccount,
  ownsTrack,
  setTrackCover,
  setTrackRate,
  setArtistAvatar,
  updateArtistProfile,
  sanitizeProfile,
} from "../domain/artist-content.ts";
import { isValidRateMillicents } from "../domain/billing.ts";

function rand(): string { return Math.random().toString(36).slice(2, 10); }

async function requireArtist(accountId: string): Promise<string> {
  const id = await artistIdForAccount(accountId);
  if (!id) throw new HttpError(403, "not an artist");
  return id;
}

export const avatarPresign: Handler = async (req) => {
  if (!dsqlConfigured() || !imagesConfigured()) return error(503, "uploads not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const ct = String((req.body as any)?.contentType ?? "");
  const ext = extForContentType(ct);
  if (!ext) return error(400, "unsupported image type");
  const key = buildImageKey("artist-avatars", artistId, ext, rand());
  const uploadUrl = await presignImagePut(key, ct);
  return ok({ uploadUrl, key }, NO_STORE);
};

export const avatarCommit: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const key = String((req.body as any)?.key ?? "");
  if (!key) return error(400, "key required");
  if (!key.startsWith(`artist-avatars/${artistId}-`)) return error(403, "bad key");
  await setArtistAvatar(artistId, key);
  return ok({ ok: true, avatarKey: key }, NO_STORE);
};

export const coverPresign: Handler = async (req) => {
  if (!dsqlConfigured() || !imagesConfigured()) return error(503, "uploads not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  if (!trackId) return error(400, "trackId required");
  if (!(await ownsTrack(artistId, trackId))) return error(403, "not your track");
  const ct = String(b.contentType ?? "");
  const ext = extForContentType(ct);
  if (!ext) return error(400, "unsupported image type");
  const key = buildImageKey("track-covers", trackId, ext, rand());
  const uploadUrl = await presignImagePut(key, ct);
  return ok({ uploadUrl, key }, NO_STORE);
};

export const coverCommit: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  if (!trackId) return error(400, "trackId required");
  const key = String(b.key ?? "");
  if (!key.startsWith(`track-covers/${trackId}-`)) return error(403, "bad key");
  const okUpd = await setTrackCover(artistId, trackId, key);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, coverImageKey: key }, NO_STORE);
};

export const rateUpdate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  if (!trackId) return error(400, "trackId required");
  const rate = b.ratePerMinuteMillicents;
  if (!isValidRateMillicents(rate)) return error(400, "invalid rate");
  const okUpd = await setTrackRate(artistId, trackId, rate);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, ratePerMinuteMillicents: rate }, NO_STORE);
};

export const profileUpdate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const fields = sanitizeProfile((req.body ?? {}) as Record<string, unknown>);
  await updateArtistProfile(artistId, fields);
  return ok({ ok: true, ...fields }, NO_STORE);
};
