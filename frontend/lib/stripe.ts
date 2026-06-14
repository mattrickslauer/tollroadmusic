// Stripe client for route handlers. The secret key comes from the ambient env
// (STRIPE_SECRET_KEY) — set it in .env.local locally and in the Vercel project
// settings for prod. Connect (Express) is used to onboard and pay out artists.

import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY;

export function stripeConfigured(): boolean {
  return Boolean(KEY);
}

let _stripe: Stripe | null = null;

/** Lazily-constructed singleton Stripe client. Throws if the key is missing. */
export function getStripe(): Stripe {
  if (!KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!_stripe) _stripe = new Stripe(KEY);
  return _stripe;
}
