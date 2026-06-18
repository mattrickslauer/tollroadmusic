// Browser-side API client — every call goes to the same-origin /api/v1 proxy,
// which forwards to the backend with the session bearer + app key. The front-end
// never talks to a database; this is its only data access.
import type {
  Catalog,
  CatalogTrack,
  LibraryTrack,
  PlaylistDetail,
  PlaylistSummary,
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
export type ChargeOk = { balanceCents: number; charged: boolean };
/** Pay for one metered minute. Returns {ok:false, balanceCents} on 402. */
export async function charge(trackId: string): Promise<{ ok: true; balanceCents: number } | { ok: false; balanceCents: number }> {
  try {
    const d = await req<ChargeOk>("/charge", body({ trackId }));
    return { ok: true, balanceCents: d.balanceCents };
  } catch (e) {
    if (e instanceof ApiError && e.status === 402) {
      return { ok: false, balanceCents: (e.body as { balanceCents?: number })?.balanceCents ?? 0 };
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
export const getBalance = () => req<{ balanceCents: number; history: HistoryRow[] }>("/balance");
export const topup = (method: "ach" | "card") =>
  req<{ demo: boolean; clientSecret?: string; publishableKey?: string; method: string; creditCents: number; feeCents: number; chargeCents: number }>(
    "/wallet/topup",
    body({ method }),
  );
export const demoCredit = (method: "ach" | "card") => req<{ balanceCents: number; demo: boolean }>("/wallet/demo-credit", body({ method }));
export const confirmTopup = (paymentIntentId: string) => req<{ balanceCents: number; status: string }>("/wallet/confirm", body({ paymentIntentId }));

// --- Library ---------------------------------------------------------------
export const getLikes = () => req<{ tracks: LibraryTrack[]; likedIds: string[] }>("/library/likes");
export const toggleLike = (trackId: string) => req<{ liked: boolean }>("/library/likes", body({ trackId }));
export const getPlaylists = () => req<{ playlists: PlaylistSummary[] }>("/playlists");
export const createPlaylist = (name: string) => req<PlaylistSummary>("/playlists", body({ name }));
export const getPlaylist = (id: string) => req<PlaylistDetail>(`/playlists/${encodeURIComponent(id)}`);
export const deletePlaylist = (id: string) => req<{ deleted: boolean }>(`/playlists/${encodeURIComponent(id)}`, { method: "DELETE" });
export const addToPlaylist = (id: string, trackId: string) => req<{ added: boolean }>(`/playlists/${encodeURIComponent(id)}/tracks`, body({ trackId }));
export const removeFromPlaylist = (id: string, trackId: string) =>
  req<{ removed: boolean }>(`/playlists/${encodeURIComponent(id)}/tracks`, { method: "DELETE", body: JSON.stringify({ trackId }), headers: { "content-type": "application/json" } });
export const getRecents = () => req<{ tracks: LibraryTrack[] }>("/recents");
export const recordPlay = (trackId: string) => req<{ ok: boolean }>("/recents", body({ trackId })).catch(() => ({ ok: false }));

// --- Artist ----------------------------------------------------------------
export const createArtist = (fields: Record<string, unknown>) => req<{ id: string; name: string }>("/artists", body(fields));

export type { Catalog, CatalogTrack, LibraryTrack, PlaylistSummary, PlaylistDetail, HistoryRow, StreamGrant };
