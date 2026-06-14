// Shared demo-catalog data + deterministic helpers.
//
// Both the asset generator (gen-demo-assets.mjs) and the seeder (seed-demo.mjs)
// import this so the audio pool, cover keys, UUIDs and metadata line up exactly.
// Everything here is DETERMINISTIC: re-running produces identical ids/rows, so
// the seed is idempotent and assets never drift from the database.

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Deterministic primitives
// ---------------------------------------------------------------------------

// Stable UUID derived from a string (RFC-4122 v5-style: sha1, version/variant
// bits forced). Same input → same id forever, which is what makes re-seeding an
// upsert rather than a duplicate.
export function uuidFrom(str) {
  const h = createHash("sha1").update(`tollroad-demo:${str}`).digest("hex");
  const b = h.slice(0, 32).split("");
  b[12] = "5"; // version 5
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16); // variant 10xx
  const s = b.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// Tiny seeded PRNG (mulberry32) so "random-looking" choices are reproducible.
export function rng(seedStr) {
  let a = parseInt(createHash("sha1").update(String(seedStr)).digest("hex").slice(0, 8), 16);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ---------------------------------------------------------------------------
// Audio pool — one original generated loop per "family"; gen-demo-assets.mjs
// renders these with ffmpeg into frontend/public/audio/demo/<id>.mp3.
// Tracks rotate over the pool filtered by their genre's family.
// ---------------------------------------------------------------------------

export const AUDIO_POOL = [
  { id: "midnight-drive", family: "electronic", bpm: 110, key: 220.0, mood: "warm synthwave pad" },
  { id: "neon-pulse", family: "electronic", bpm: 124, key: 261.63, mood: "driving house" },
  { id: "deep-current", family: "electronic", bpm: 120, key: 196.0, mood: "deep techno" },
  { id: "golden-hour", family: "chill", bpm: 84, key: 293.66, mood: "lo-fi keys" },
  { id: "paper-rain", family: "chill", bpm: 72, key: 246.94, mood: "ambient bells" },
  { id: "slow-tide", family: "chill", bpm: 90, key: 174.61, mood: "downtempo" },
  { id: "back-pocket", family: "urban", bpm: 96, key: 130.81, mood: "boom-bap hip-hop" },
  { id: "velvet-rope", family: "urban", bpm: 100, key: 164.81, mood: "smooth r&b" },
  { id: "after-hours", family: "urban", bpm: 88, key: 146.83, mood: "trap soul" },
  { id: "open-road", family: "band", bpm: 128, key: 329.63, mood: "indie rock" },
  { id: "front-porch", family: "band", bpm: 104, key: 220.0, mood: "folk acoustic" },
  { id: "blue-note", family: "band", bpm: 112, key: 261.63, mood: "jazz trio" },
];

// genre → which audio family its tracks pull from
const GENRE_FAMILY = {
  "Hip-Hop": "urban",
  "R&B": "urban",
  Soul: "urban",
  Drill: "urban",
  Pop: "electronic",
  Electronic: "electronic",
  House: "electronic",
  Synthwave: "electronic",
  "Lo-Fi": "chill",
  Ambient: "chill",
  Downtempo: "chill",
  "Indie Rock": "band",
  Folk: "band",
  Jazz: "band",
};

export function audioForGenre(genre, seed) {
  const family = GENRE_FAMILY[genre] || "chill";
  const pool = AUDIO_POOL.filter((a) => a.family === family);
  const r = rng(`audio:${seed}`);
  return pick(r, pool);
}

// ---------------------------------------------------------------------------
// Curated artists — hand-picked so names/genres/cities read as real, not as
// "Adjective Noun #37". 60 entries (we surface the first N; default 55).
// ---------------------------------------------------------------------------

const ARTISTS_RAW = [
  ["Velvet Arcade", "Synthwave", "Los Angeles, CA"],
  ["Marisol Vega", "R&B", "Houston, TX"],
  ["The Paper Kites Collective", "Indie Rock", "Portland, OR"],
  ["Koji Tanaka Trio", "Jazz", "Brooklyn, NY"],
  ["DJ Halcyon", "House", "Detroit, MI"],
  ["Amara Okeke", "Afro-Soul", "Atlanta, GA"],
  ["Nightwell", "Electronic", "Berlin, DE"],
  ["Sage & Cedar", "Folk", "Asheville, NC"],
  ["Rico Delgado", "Hip-Hop", "Bronx, NY"],
  ["Lunar Tide", "Ambient", "Reykjavik, IS"],
  ["The Brass Union", "Soul", "New Orleans, LA"],
  ["Priya Nair", "Pop", "Toronto, ON"],
  ["Greyson Pike", "Indie Rock", "Austin, TX"],
  ["Mute Cinema", "Downtempo", "London, UK"],
  ["Tasha Monroe", "R&B", "Chicago, IL"],
  ["Cobalt Hour", "Synthwave", "Miami, FL"],
  ["The Wandering Hours", "Folk", "Nashville, TN"],
  ["Femi Adeyemi", "Hip-Hop", "London, UK"],
  ["Saint Avery", "Pop", "Los Angeles, CA"],
  ["Hollow Coast", "Indie Rock", "Seattle, WA"],
  ["Niko Vance", "Drill", "Chicago, IL"],
  ["Ember & Oak", "Folk", "Denver, CO"],
  ["Selene Cruz", "Electronic", "Barcelona, ES"],
  ["The Low Lantern", "Jazz", "Philadelphia, PA"],
  ["Mara Lindqvist", "Ambient", "Stockholm, SE"],
  ["Two Rivers North", "Indie Rock", "Minneapolis, MN"],
  ["Jaylen Brooks", "R&B", "Memphis, TN"],
  ["Phantom Arcade", "Synthwave", "San Francisco, CA"],
  ["Imani Sol", "Afro-Soul", "Lagos, NG"],
  ["The Dust Choir", "Folk", "Boise, ID"],
  ["Kasimir", "House", "Amsterdam, NL"],
  ["Odessa Lane", "Pop", "Manchester, UK"],
  ["Bento Reyes", "Hip-Hop", "São Paulo, BR"],
  ["Glass Harbor", "Ambient", "Vancouver, BC"],
  ["The Velour Set", "Soul", "Detroit, MI"],
  ["Lena Whitfield", "Jazz", "Kansas City, MO"],
  ["Static Meridian", "Electronic", "Tokyo, JP"],
  ["Cole Hartman", "Indie Rock", "Columbus, OH"],
  ["Yara Haddad", "Pop", "Beirut, LB"],
  ["The Northern Drift", "Folk", "Halifax, NS"],
  ["Dontae Price", "Drill", "Brooklyn, NY"],
  ["Aurora Bell", "Synthwave", "Las Vegas, NV"],
  ["Kwame Mensah", "Afro-Soul", "Accra, GH"],
  ["Pale Geometry", "Downtempo", "Oslo, NO"],
  ["Sofia Marchetti", "Jazz", "Milan, IT"],
  ["The Hush Engine", "Indie Rock", "Glasgow, UK"],
  ["Reza Karimi", "Electronic", "Dubai, AE"],
  ["Hattie Crow", "Folk", "Louisville, KY"],
  ["Midas Lane", "Hip-Hop", "Oakland, CA"],
  ["Cyan Fields", "Ambient", "Wellington, NZ"],
  ["The Copper Lights", "Soul", "Birmingham, UK"],
  ["Noa Stein", "Pop", "Tel Aviv, IL"],
  ["Grover & The Tide", "Indie Rock", "San Diego, CA"],
  ["Lux Pereira", "House", "Lisbon, PT"],
  ["Wren Castellano", "Jazz", "Boston, MA"],
  ["Halflight Honey", "Lo-Fi", "Kyoto, JP"],
  ["Tobias Frank", "Electronic", "Munich, DE"],
  ["Della Mae Carter", "Folk", "Bristol, TN"],
  ["Onyx Carrow", "Drill", "London, UK"],
  ["Seraphine", "Pop", "Paris, FR"],
];

const BIO_TEMPLATES = [
  (g, c) => `${g} artist out of ${c}. Self-produced, fiercely independent, and built for the long play.`,
  (g, c) => `Making ${g.toLowerCase()} that lingers. Based in ${c}, recorded mostly at 2am.`,
  (g, c) => `${c} native blending ${g.toLowerCase()} with whatever's on the turntable that week.`,
  (g, c) => `Songs about leaving and coming back. ${g} from ${c}.`,
  (g, c) => `Independent ${g.toLowerCase()} project. Every minute you play goes (almost) straight to the studio rent in ${c}.`,
  (g, c) => `Live takes, no autotune crutch. ${g} with roots in ${c}.`,
  (g, c) => `${g} for late drives and longer nights. ${c}.`,
];

const TLDS = ["com", "music", "fm", "co"];

export function buildArtists(count = 55) {
  return ARTISTS_RAW.slice(0, count).map(([name, genre, location], i) => {
    const r = rng(`artist:${name}`);
    const s = slug(name);
    const handle = s.replace(/-/g, "");
    const bio = pick(r, BIO_TEMPLATES)(genre, location.split(",")[0]);
    return {
      id: uuidFrom(`artist:${name}`),
      name,
      genre,
      location,
      email: `${handle}@${pick(r, ["gmail.com", "proton.me", "icloud.com", `${handle}.${pick(r, TLDS)}`])}`,
      website: r() < 0.7 ? `https://${handle}.${pick(r, TLDS)}` : null,
      bio,
      avatar_key: `/covers/artist-${s}.svg`,
      slug: s,
      // mark a slice as payout-ready so the dashboard shows a realistic mix
      payouts_enabled: r() < 0.45,
      stripe_account_id: null, // demo: never write a fake acct_ id
    };
  });
}

// ---------------------------------------------------------------------------
// Track titles — assembled per genre so they fit the artist, then made unique.
// ---------------------------------------------------------------------------

const TITLE_BANK = {
  open: ["Midnight", "Golden", "Paper", "Velvet", "Hollow", "Neon", "Slow", "Quiet", "Wild", "Cold", "Lonesome", "Electric", "Faded", "Crimson", "Silver", "Restless", "Tender", "Distant"],
  close: ["Avenue", "Lights", "Hours", "Tide", "Rooms", "Highway", "Static", "Bloom", "Ghost", "Fever", "Mornings", "Letters", "Smoke", "Gold", "Rain", "Signal", "Country", "Heart"],
  solo: ["Undertow", "Afterglow", "Lowlands", "Cassette", "Dial Tone", "Saltwater", "Telegraph", "Overpass", "Wildfire", "Cathedral", "Backroads", "Moonlit", "Driftwood", "Nightshift", "Honeycomb", "Crosswind", "Pioneer", "Aftertaste", "Birdsong", "Concrete"],
};

export function buildTracks(artist, perMin = 3, perMax = 5) {
  const r = rng(`tracks:${artist.id}`);
  const n = perMin + Math.floor(r() * (perMax - perMin + 1));
  const used = new Set();
  const tracks = [];
  for (let i = 0; i < n; i++) {
    let title;
    for (let guard = 0; guard < 12; guard++) {
      title = r() < 0.6 ? `${pick(r, TITLE_BANK.open)} ${pick(r, TITLE_BANK.close)}` : pick(r, TITLE_BANK.solo);
      if (!used.has(title)) break;
    }
    used.add(title);
    const audio = audioForGenre(artist.genre, `${artist.id}:${i}`);
    const duration = 135 + Math.floor(r() * 150); // 2:15 – 4:45
    // most artists set the floor (1¢/min); a few price higher
    const price = r() < 0.72 ? 1 : pick(r, [2, 2, 3, 4, 5]);
    tracks.push({
      id: uuidFrom(`track:${artist.id}:${title}`),
      artist_id: artist.id,
      title,
      duration_seconds: duration,
      price_per_minute_cents: price,
      audio_key: `/audio/demo/${audio.id}.mp3`,
      cover_image_key: `/covers/track-${slug(title)}-${audio.id}.svg`,
      // popularity weight drives how much fake play history this track gets
      popularity: 0.2 + r() * 0.8,
    });
  }
  return tracks;
}

export { slug, pick };
