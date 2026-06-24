// Shared API response types — the shapes the backend /v1 endpoints return. The
// front-end consumes these; it owns no database models. (Mirrors
// backend/src/domain/catalog.ts + library.ts.)

export type CatalogTrack = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  genre: string | null;
  durationSeconds: number;
  pricePerMinuteCents: number;
  coverImageKey: string | null;
};

export type CatalogArtist = {
  id: string;
  name: string;
  genre: string | null;
  location: string | null;
  bio: string | null;
  avatarKey: string | null;
  payoutsEnabled: boolean;
  trackCount: number;
  minutes: number;
  earningsCents: number;
};

export type Catalog = {
  artists: CatalogArtist[];
  tracks: CatalogTrack[];
  stats: { artists: number; tracks: number; minutes: number; earningsCents: number };
};

export type LibraryTrack = CatalogTrack & { addedAt?: number };

export type PlaylistSummary = {
  id: string;
  name: string;
  coverTrackId: string | null;
  trackCount: number;
  createdAt: string;
  visibility: "public" | "private";
};

export type PlaylistDetail = PlaylistSummary & { tracks: LibraryTrack[] };

export type PublicPlaylist = PlaylistDetail & { ownerHandle: string | null; ownerName: string };

export type HistoryRow = {
  trackId: string;
  title: string;
  artistName: string;
  coverImageKey: string | null;
  minutes: number;
  amountCents: number;
  lastPlayedEpoch: number;
};

/** A stream authorization grant (the x402-authorized result). */
export type StreamGrant = {
  url: string;
  expiresAt: number;
  mode: "signed-url" | "proxy";
};

export type ArtistProfile = {
  artist: {
    id: string; name: string; genre: string | null; location: string | null;
    bio: string | null; website: string | null; avatarKey: string | null; trackCount: number;
  };
  tracks: CatalogTrack[];
};

/** The signed-in artist's royalty summary (GET /v1/artist/summary). Read from
 *  the precomputed artist_daily_summary — never the raw ledger. */
export type ArtistTrack = {
  id: string;
  title: string;
  durationSeconds: number;
  pricePerMinuteCents: number;
  coverImageKey: string | null;
};

export type ArtistSummary = {
  artist: { id: string; name: string; genre: string | null };
  artistId: string;
  minutes: number;
  earningsCents: number;
  trackCount: number;
  byDay: { day: string; minutes: number; amountCents: number }[];
  tracks: ArtistTrack[];
};
