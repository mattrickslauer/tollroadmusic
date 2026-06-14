// GET /api/artists/onboarding-refresh?account=acct_…
//
// Stripe account links are single-use and expire. This is the `refresh_url`:
// when a link is stale, Stripe sends the artist here and we mint a fresh one
// and redirect straight back into onboarding.

import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const account = req.nextUrl.searchParams.get("account");

  if (!account || !account.startsWith("acct_") || !stripeConfigured()) {
    return NextResponse.redirect(new URL("/signup", origin));
  }

  try {
    const link = await getStripe().accountLinks.create({
      account,
      refresh_url: `${origin}/api/artists/onboarding-refresh?account=${account}`,
      return_url: `${origin}/signup/done`,
      type: "account_onboarding",
    });
    return NextResponse.redirect(link.url, 303);
  } catch (err) {
    console.error("onboarding refresh failed:", err);
    return NextResponse.redirect(new URL("/signup?onboarding=error", origin));
  }
}
