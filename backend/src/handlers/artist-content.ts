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
import {
  isValidTitle,
  isValidDuration,
  extForAudioContentType,
  buildAudioKey,
  audioConfigured,
  presignAudioPut,
  createTrack,
  setTrackAudio,
  updateTrack,
  softDeleteTrack,
} from "../domain/tracks-crud.ts";

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

const DEFAULT_RATE_MILLICENTS = 1000; // 1¢/min, matches the schema default

export const trackCreate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  if (!isValidTitle(b.title)) return error(400, "title required (1–200 chars)");
  if (!isValidDuration(b.durationSeconds)) return error(400, "durationSeconds must be 1–36000");
  const rate = b.pricePerMinuteMillicents ?? DEFAULT_RATE_MILLICENTS;
  if (!isValidRateMillicents(rate)) return error(400, "invalid rate");
  const { id } = await createTrack({
    artistId,
    title: String(b.title),
    durationSeconds: b.durationSeconds,
    pricePerMinuteMillicents: rate,
  });
  return ok({ id }, NO_STORE);
};

export const audioPresign: Handler = async (req) => {
  if (!dsqlConfigured() || !audioConfigured()) return error(503, "uploads not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  if (!trackId) return error(400, "trackId required");
  if (!(await ownsTrack(artistId, trackId))) return error(403, "not your track");
  const ct = String(b.contentType ?? "");
  const ext = extForAudioContentType(ct);
  if (!ext) return error(400, "unsupported audio type");
  const key = buildAudioKey(trackId, ext, rand());
  const uploadUrl = await presignAudioPut(key, ct);
  return ok({ uploadUrl, key }, NO_STORE);
};

export const audioCommit: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const b = (req.body ?? {}) as any;
  const trackId = String(b.trackId ?? "");
  const key = String(b.key ?? "");
  if (!trackId) return error(400, "trackId required");
  if (!key.startsWith(`audio/${trackId}-`)) return error(403, "bad key");
  const okUpd = await setTrackAudio(artistId, trackId, key);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, audioKey: key }, NO_STORE);
};

export const trackUpdate: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const trackId = String(req.params.id ?? "");
  if (!trackId) return error(400, "track id required");
  const b = (req.body ?? {}) as any;
  const fields: { title?: string; durationSeconds?: number; pricePerMinuteMillicents?: number } = {};
  if (b.title !== undefined) {
    if (!isValidTitle(b.title)) return error(400, "invalid title");
    fields.title = String(b.title);
  }
  if (b.durationSeconds !== undefined) {
    if (!isValidDuration(b.durationSeconds)) return error(400, "invalid durationSeconds");
    fields.durationSeconds = b.durationSeconds;
  }
  if (b.pricePerMinuteMillicents !== undefined) {
    if (!isValidRateMillicents(b.pricePerMinuteMillicents)) return error(400, "invalid rate");
    fields.pricePerMinuteMillicents = b.pricePerMinuteMillicents;
  }
  if (!Object.keys(fields).length) return error(400, "no fields to update");
  const okUpd = await updateTrack(artistId, trackId, fields);
  if (!okUpd) return error(403, "not your track");
  return ok({ ok: true, ...fields }, NO_STORE);
};

export const trackDelete: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);
  const trackId = String(req.params.id ?? "");
  if (!trackId) return error(400, "track id required");
  const okDel = await softDeleteTrack(artistId, trackId);
  if (!okDel) return error(403, "not your track");
  return ok({ ok: true, deleted: true }, NO_STORE);
};
