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
  pricePerMinuteMillicents: number;
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
  earningsMillicents: number;
};

export type Catalog = {
  artists: CatalogArtist[];
  tracks: CatalogTrack[];
  stats: { artists: number; tracks: number; minutes: number; earningsMillicents: number };
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
  artistId: string;
  coverImageKey: string | null;
  minutes: number;
  amountMillicents: number;
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
  pricePerMinuteMillicents: number;
  coverImageKey: string | null;
};

export type ArtistSummary = {
  artist: { id: string; name: string; genre: string | null; location: string | null; bio: string | null; website: string | null; avatarKey: string | null };
  artistId: string;
  minutes: number;
  earningsMillicents: number;
  trackCount: number;
  byDay: { day: string; minutes: number; amountMillicents: number }[];
  tracks: ArtistTrack[];
  /** False when the backend has no images bucket configured — image uploads will 503.
   *  Optional: a backend predating this flag omits it, which callers treat as enabled. */
  uploadsConfigured?: boolean;
};

// --- Superfan Bond ----------------------------------------------------------
// A listener's accrued relationship with one artist. `bondPoints` accrue at
// BP_PER_MINUTE per metered minute heard; tiers/rank are derived server-side
// (mirrored client-side in lib/bond/bondConfig.ts for optimistic UI).
export interface Bond {
  artistId: string;
  artistName: string;
  bondPoints: number;
  minutes: number;
  amountMillicents: number;
  tier: string;
  tierIndex: number;
  nextTier: string | null;
  nextTierAt: number | null;
  progressToNext: number;
  rank: number | null;
  totalFans: number;
  streakDays: number;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  displayName: string;
  bondPoints: number;
  tier: string;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  totalFans: number;
}

export interface BondSummary {
  artistId: string;
  artistName: string;
  bondPoints: number;
  minutes: number;
  tier: string;
  tierIndex: number;
  rank: number | null;
  totalFans: number;
}

export interface MyBonds {
  bonds: BondSummary[];
  streakDays: number;
  totalBondPoints: number;
}

export interface ProfileBonds {
  handle: string;
  displayName: string;
  bonds: BondSummary[];
  totalBondPoints: number;
}
