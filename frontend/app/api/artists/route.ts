// POST /api/artists — create the ARTIST PROFILE for the signed-in account.
// Artist is now a profile of an account (artists.account_id), so this requires
// a session: sign in with email first, then attach the profile. An account may
// hold both an artist profile and a listener profile at once.
//
// Name + email are required; the rest is optional so the form stays SuperEasy.
// Stripe Connect payouts remain deferred.
import { NextRequest, NextResponse } from "next/server";
import { withDsql, dsqlConfigured } from "@/lib/dsql";
import { readSession, sessionConfigured } from "@/lib/server/session";
import { createArtistProfile } from "@/lib/server/accounts";

// `pg` + the DSQL signer need Node APIs — not the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = { name: 120, email: 254, genre: 80, location: 120, website: 200, bio: 2000 };

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// Deliberately permissive — good enough to catch typos, not a gatekeeper.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!dsqlConfigured() || !sessionConfigured()) {
    return NextResponse.json({ error: "Sign-up is not configured yet." }, { status: 503 });
  }

  const session = await readSession(req);
  if (!session) {
    return NextResponse.json({ error: "Sign in first to create an artist profile." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  if (!name) {
    return NextResponse.json({ error: "Artist or band name is required." }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const genre = clean(body.genre, MAX.genre);
  const location = clean(body.location, MAX.location);
  const website = clean(body.website, MAX.website);
  const bio = clean(body.bio, MAX.bio);

  try {
    const profile = await withDsql(async () =>
      createArtistProfile(session.sub, { name, email, genre, location, website, bio }),
    );
    return NextResponse.json({ id: profile.id, name: profile.name }, { status: 201 });
  } catch (err) {
    console.error("artist profile create failed:", err);
    return NextResponse.json({ error: "Could not save your profile. Please try again." }, { status: 500 });
  }
}
