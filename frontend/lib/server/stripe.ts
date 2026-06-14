// Server-only: the Stripe client for wallet top-ups. Lazily constructed from
// STRIPE_SECRET_KEY so the rest of the app (and the demo) runs without Stripe
// configured — callers check stripeConfigured() first and fall back to the
// demo-credit path when it's false.
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) client = new Stripe(secret);
  return client;
}

export function publishableKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
}
