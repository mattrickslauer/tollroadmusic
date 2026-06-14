// POST /api/artists — artist sign-up.
//
// 1. validate (name + email required; rest optional)
// 2. create a Stripe Connect Express account for the artist
// 3. persist the artist row (incl. stripe_account_id) into DSQL
// 4. mint a Stripe-hosted onboarding link and return its URL
//
// The browser then redirects the artist to Stripe to enter bank/identity
// details. A webhook (account.updated) flips payouts_enabled when Stripe is
// satisfied. We never store raw payout details — Stripe holds them.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withDsql, dsqlConfigured } from "@/lib/dsql";
import { getStripe, stripeConfigured } from "@/lib/stripe";

// `pg` + the DSQL/Stripe SDKs need Node APIs — not the edge runtime.
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

const INSERT_SQL = `
  INSERT INTO artists (id, name, email, genre, location, website, bio, stripe_account_id, payouts_enabled)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
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
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Payouts are not configured yet (STRIPE_SECRET_KEY missing)." },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  const origin = req.nextUrl.origin;

  // 1. Stripe Connect (Express) account. `transfers` is the capability that lets
  //    the platform pay the artist their per-minute royalties.
  let accountId: string;
  try {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      business_type: "individual",
      business_profile: {
        name,
        product_description: "Per-minute music streaming royalties on TollRoad",
        ...(website ? { url: website } : {}),
      },
      capabilities: { transfers: { requested: true } },
      metadata: { source: "tollroad-signup", ...(genre ? { genre } : {}) },
    });
    accountId = account.id;
  } catch (err) {
    console.error("stripe account create failed:", err);
    return NextResponse.json(
      { error: "Could not start payout setup. Please try again." },
      { status: 502 },
    );
  }

  // 2. Persist the artist. If this fails, delete the orphaned Stripe account so
  //    a retry starts clean.
  const id = randomUUID();
  try {
    await withDsql((db) =>
      db.query(INSERT_SQL, [id, name, email, genre, location, website, bio, accountId]),
    );
  } catch (err) {
    console.error("artist insert failed, rolling back stripe account:", err);
    await stripe.accounts.del(accountId).catch(() => {});
    return NextResponse.json(
      { error: "Could not save your sign-up. Please try again." },
      { status: 500 },
    );
  }

  // 3. Hosted onboarding link. If it can't be minted, the artist is still saved
  //    and can resume later — surface a soft warning instead of failing.
  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/api/artists/onboarding-refresh?account=${accountId}`,
      return_url: `${origin}/signup/done?artist=${id}`,
      type: "account_onboarding",
    });
    return NextResponse.json(
      { id, stripeAccountId: accountId, onboardingUrl: link.url },
      { status: 201 },
    );
  } catch (err) {
    console.error("stripe account link failed:", err);
    return NextResponse.json(
      {
        id,
        stripeAccountId: accountId,
        onboardingUrl: null,
        warning: "You're saved, but we couldn't open Stripe onboarding. We'll email you a link to finish payout setup.",
      },
      { status: 201 },
    );
  }
}
