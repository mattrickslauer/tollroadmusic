// GET /v1/artist/summary — the signed-in artist's royalty summary, read from the
// precomputed artist_daily_summary (never the raw ledger). 403 if the account
// has no artist profile.
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { getProfiles, createArtistProfile } from "../domain/accounts.ts";
import { getArtistSummary } from "../domain/catalog.ts";

const MAX = { name: 120, email: 254, genre: 80, location: 120, website: 200, bio: 2000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** POST /v1/artists — create the artist profile for the signed-in account. */
export const create: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "Sign-up is not configured yet.");
  const session = await requireSession(req);
  const b = (req.body ?? {}) as Record<string, unknown>;

  const name = clean(b.name, MAX.name);
  const email = clean(b.email, MAX.email);
  if (!name) return error(400, "Artist or band name is required.");
  if (!email || !EMAIL_RE.test(email)) return error(400, "A valid email is required.");

  try {
    const profile = await createArtistProfile(session.sub, {
      name,
      email,
      genre: clean(b.genre, MAX.genre),
      location: clean(b.location, MAX.location),
      website: clean(b.website, MAX.website),
      bio: clean(b.bio, MAX.bio),
    });
    return { status: 201, body: { id: profile.id, name: profile.name } };
  } catch (err) {
    console.error("artist profile create failed:", err);
    return error(500, "Could not save your profile. Please try again.");
  }
};

export const summary: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "not configured");
  const session = await requireSession(req);
  const profiles = await getProfiles(session.sub);
  if (!profiles.artist) return error(403, "not an artist");
  const data = await getArtistSummary(profiles.artist.id);
  return ok({ artist: profiles.artist, ...data });
};
