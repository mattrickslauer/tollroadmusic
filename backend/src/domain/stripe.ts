// The Stripe client for wallet top-ups. Ported from the front-end's
// lib/server/stripe.ts. Lazily constructed so the demo runs without Stripe.
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

export function webhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}
