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
  isActive: boolean;
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

// --- Vibe Pad / mood-tagging mini-game --------------------------------------
// A mood trace: a time-aligned path through the valence/energy plane for one
// play of one song. Samples are parallel grid-aligned arrays (index = time bin,
// bin = floor(ms / gridMs)); `null` = a gap (puck released / no signal); values
// in [-1, 1]. Array length = ceil(durationMs / gridMs).
export type MoodSamples = { v: (number | null)[]; e: (number | null)[] };

/** POST /v1/mood/trace body — the whole trace, submitted once on song end. */
export type MoodTraceSubmit = { songId: string; gridMs: number; durationMs: number; samples: MoodSamples };

/** POST /v1/mood/trace result — coverage, agreement vs. crowd, and the reward. */
export type MoodTraceResult = {
  traceId: string;
  coveragePct: number;
  /** 0–1 agreement with the crowd consensus; null when bootstrapping (untrusted). */
  agreement: number | null;
  /** True when too few traces exist yet to trust agreement → flat bootstrap credit. */
  bootstrap: boolean;
  rewardMillicents: number;
  rewardMinutes: number;
  newBalanceMillicents: number;
  /** True when this (user, song) was already rewarded — the trace updates, no new credit. */
  alreadyRewarded: boolean;
};

export type MoodQuadrant = "hype" | "tense" | "sad" | "chill";

export type MoodTags = {
  dominantQuadrant: MoodQuadrant | null;
  arcLabel: string | null;
  valenceMean: number | null;
  energyMean: number | null;
  confidence: number;
  source: "human" | "predicted";
};

/** GET /v1/mood/consensus/{songId} — the binned crowd curve (ghost source). */
export type MoodConsensus = {
  songId: string;
  gridMs: number;
  traceCount: number;
  consensus: MoodSamples;
  tags: MoodTags | null;
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

// --- Payouts ----------------------------------------------------------------
export type PayoutHistoryRow = {
  id: string;
  amountMillicents: number;
  status: string;
  createdAt: string;
};
export type PayoutStatus = {
  connected: boolean;
  payoutsEnabled: boolean;
  availableMillicents: number;
  history: PayoutHistoryRow[];
};
