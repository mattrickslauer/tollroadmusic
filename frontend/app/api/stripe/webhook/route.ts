// POST /api/stripe/webhook — Stripe Connect events.
//
// We care about `account.updated`: when Stripe finishes verifying an artist's
// Express account it sets payouts_enabled=true, and we mirror that flag into
// DSQL so the rest of the app knows the artist can be paid.
//
// Configure the endpoint in the Stripe dashboard (or `stripe listen
// --forward-to …/api/stripe/webhook` locally) and put the signing secret in
// STRIPE_WEBHOOK_SECRET.

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { withDsql, dsqlConfigured } from "@/lib/dsql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!stripeConfigured() || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // Signature verification needs the raw, unparsed body.
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe webhook signature failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const enabled = Boolean(account.payouts_enabled);
    if (dsqlConfigured()) {
      try {
        await withDsql((db) =>
          db.query(`UPDATE artists SET payouts_enabled = $1 WHERE stripe_account_id = $2`, [
            enabled,
            account.id,
          ]),
        );
      } catch (err) {
        // Don't 500 the webhook — Stripe will retry. Log and move on.
        console.error("failed to update payouts_enabled:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
