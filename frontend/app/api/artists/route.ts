// POST /api/artists — artist sign-up. Writes one row into the DSQL `artists`
// table (the relational system-of-record). Name + email are required; the
// rest is optional so the form stays SuperEasy.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withDsql, dsqlConfigured } from "@/lib/dsql";

// `pg` + the DSQL signer need Node APIs — not the edge runtime.
export const runtime = "nodejs";
// Never cache a write endpoint.
export const dynamic = "force-dynamic";

const MAX = { name: 120, email: 254, payoutRef: 200, genre: 80, location: 120, website: 200, bio: 2000 };

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// Deliberately permissive — good enough to catch typos, not a gatekeeper.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INSERT_SQL = `
  INSERT INTO artists (id, name, email, payout_ref, genre, location, website, bio)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING id, created_at`;

export async function POST(req: NextRequest) {
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

  const payoutRef = clean(body.payoutRef, MAX.payoutRef);
  const genre = clean(body.genre, MAX.genre);
  const location = clean(body.location, MAX.location);
  const website = clean(body.website, MAX.website);
  const bio = clean(body.bio, MAX.bio);

  if (!dsqlConfigured()) {
    return NextResponse.json(
      { error: "Sign-up is not configured yet (TOLLROAD_DSQL_ENDPOINT missing)." },
      { status: 503 },
    );
  }

  const id = randomUUID();
  try {
    const result = await withDsql((db) =>
      db.query(INSERT_SQL, [id, name, email, payoutRef, genre, location, website, bio]),
    );
    const row = result.rows[0];
    return NextResponse.json(
      { id: row.id, name, createdAt: row.created_at },
      { status: 201 },
    );
  } catch (err) {
    console.error("artist sign-up failed:", err);
    return NextResponse.json(
      { error: "Could not save your sign-up. Please try again." },
      { status: 500 },
    );
  }
}
