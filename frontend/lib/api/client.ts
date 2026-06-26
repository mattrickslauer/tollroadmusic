// Browser-side API client — every call goes to the same-origin /api/v1 proxy,
// which forwards to the backend with the session bearer + app key. The front-end
// never talks to a database; this is its only data access.
import type {
  ArtistProfile,
  Catalog,
  CatalogTrack,
  LibraryTrack,
  PlaylistDetail,
  PlaylistSummary,
  PublicPlaylist,
  HistoryRow,
  StreamGrant,
} from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `error ${res.status}`, data);
  return data as T;
}

function body(b: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(b) };
}

// --- Catalog ---------------------------------------------------------------
export const getCatalog = () => req<Catalog>("/catalog");

// --- Billing / x402 --------------------------------------------------------
export type ChargeOk = { balanceMillicents: number; charged: boolean };
/** Pay for one metered minute. Returns {ok:false, balanceMillicents} on 402. */
export async function charge(trackId: string): Promise<{ ok: true; balanceMillicents: number } | { ok: false; balanceMillicents: number }> {
  try {
    const d = await req<ChargeOk>("/charge", body({ trackId }));
    return { ok: true, balanceMillicents: d.balanceMillicents };
  } catch (e) {
    if (e instanceof ApiError && e.status === 402) {
      return { ok: false, balanceMillicents: (e.body as { balanceMillicents?: number })?.balanceMillicents ?? 0 };
    }
    throw e;
  }
}

/** Authorize streaming a track. Returns the audio URL to point <audio> at. */
export async function streamUrl(trackId: string): Promise<string> {
  const grant = await req<StreamGrant>(`/stream/${encodeURIComponent(trackId)}`);
  // proxy mode → pull bytes through this same-origin proxy (so the cookie rides
  // along); signed-url mode → straight from CloudFront.
  return grant.mode === "signed-url" ? grant.url : `${BASE}/stream/${encodeURIComponent(trackId)}/raw`;
}

// --- Wallet ----------------------------------------------------------------
export const getBalance = () => req<{ balanceMillicents: number; history: HistoryRow[] }>("/balance");
export const topup = (method: "ach" | "card") =>
  req<{ demo: boolean; clientSecret?: string; publishableKey?: string; method: string; creditCents: number; feeCents: number; chargeCents: number }>(
    "/wallet/topup",
    body({ method }),
  );
export const demoCredit = (method: "ach" | "card") => req<{ balanceMillicents: number; demo: boolean }>("/wallet/demo-credit", body({ method }));
/** Claim the one-time $3 (300-minute) welcome gift. Idempotent server-side. */
export const claimOnboardingGift = () => req<{ credited: boolean; balanceMillicents: number }>("/wallet/onboarding-gift", body({}));
export const confirmTopup = (paymentIntentId: string) => req<{ balanceMillicents: number; status: string }>("/wallet/confirm", body({ paymentIntentId }));

// --- Library ---------------------------------------------------------------
export const getLikes = () => req<{ tracks: LibraryTrack[]; likedIds: string[] }>("/library/likes");
export const toggleLike = (trackId: string) => req<{ liked: boolean }>("/library/likes", body({ trackId }));
export const getPlaylists = () => req<{ playlists: PlaylistSummary[] }>("/playlists");
export const createPlaylist = (name: string) => req<PlaylistSummary>("/playlists", body({ name }));
export const getPlaylist = (id: string) => req<PlaylistDetail>(`/playlists/${encodeURIComponent(id)}`);
export const setPlaylistVisibility = (id: string, visibility: "public" | "private") =>
  req<{ visibility: "public" | "private" }>(`/playlists/${encodeURIComponent(id)}/visibility`, body({ visibility }));
export const getPublicPlaylist = (id: string) => req<PublicPlaylist>(`/playlists/${encodeURIComponent(id)}/public`);
export const deletePlaylist = (id: string) => req<{ deleted: boolean }>(`/playlists/${encodeURIComponent(id)}`, { method: "DELETE" });
export const addToPlaylist = (id: string, trackId: string) => req<{ added: boolean }>(`/playlists/${encodeURIComponent(id)}/tracks`, body({ trackId }));
export const removeFromPlaylist = (id: string, trackId: string) =>
  req<{ removed: boolean }>(`/playlists/${encodeURIComponent(id)}/tracks`, { method: "DELETE", body: JSON.stringify({ trackId }), headers: { "content-type": "application/json" } });
export const getRecents = () => req<{ tracks: LibraryTrack[] }>("/recents");
export const recordPlay = (trackId: string) => req<{ ok: boolean }>("/recents", body({ trackId })).catch(() => ({ ok: false }));

// --- Artist ----------------------------------------------------------------
export const createArtist = (fields: Record<string, unknown>) => req<{ id: string; name: string }>("/artists", body(fields));
export const getArtist = (id: string) => req<ArtistProfile>(`/artists/${encodeURIComponent(id)}`);

/** Set the per-minute rate for a track. Rate is in millicents (0 = free, max 100000, step 100). */
export const setTrackRate = (trackId: string, ratePerMinuteMillicents: number) =>
  req<{ ok: boolean; ratePerMinuteMillicents: number }>("/artist/track/rate", body({ trackId, ratePerMinuteMillicents }));

// --- Artist content / profile ----------------------------------------------
export const presignAvatar = (contentType: string) =>
  req<{ uploadUrl: string; key: string }>("/artist/avatar/presign", body({ contentType }));
export const commitAvatar = (key: string) =>
  req<{ ok: true; avatarKey: string }>("/artist/avatar/commit", body({ key }));
export const presignCover = (trackId: string, contentType: string) =>
  req<{ uploadUrl: string; key: string }>("/artist/cover/presign", body({ trackId, contentType }));
export const commitCover = (trackId: string, key: string) =>
  req<{ ok: true; coverImageKey: string }>("/artist/cover/commit", body({ trackId, key }));
export const updateArtistProfile = (fields: Record<string, string>) =>
  req<{ ok: true }>("/artist/profile", body(fields));

// Presign -> PUT the bytes straight to S3 -> commit. Returns the stored key.
export async function uploadImage(
  file: File,
  presign: (ct: string) => Promise<{ uploadUrl: string; key: string }>,
  commit: (key: string) => Promise<unknown>,
): Promise<string> {
  const { uploadUrl, key } = await presign(file.type);
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  await commit(key);
  return key;
}

export type { ArtistProfile, Catalog, CatalogTrack, LibraryTrack, PlaylistSummary, PlaylistDetail, PublicPlaylist, HistoryRow, StreamGrant };
