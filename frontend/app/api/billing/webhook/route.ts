// POST /api/billing/webhook — Stripe's authoritative top-up signal. Verifies the
// signature with STRIPE_WEBHOOK_SECRET, then credits the wallet on
// payment_intent.succeeded / .processing. Idempotent on the PaymentIntent id, so
// replays and the client confirm() racing the webhook never double-credit.
import { stripe, stripeConfigured } from "@/lib/server/stripe";
import { creditTopup } from "@/lib/server/billing";
import { dsqlConfigured } from "@/lib/dsql";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!stripeConfigured() || !dsqlConfigured()) {
    return new Response("billing not configured", { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not set", { status: 503 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, sig, secret);
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return new Response("bad signature", { status: 400 });
  }

  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.processing") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const meta = pi.metadata ?? {};
    if (meta.purpose === "wallet_topup" && meta.accountId) {
      try {
        await creditTopup({
          accountId: meta.accountId,
          paymentRef: pi.id,
          amountCents: Number(meta.creditCents) || 0,
          feeCents: Number(meta.feeCents) || 0,
          method: meta.method === "card" ? "card" : "ach",
          status: pi.status,
        });
      } catch (err) {
        console.error("webhook credit failed", err);
        return new Response("credit failed", { status: 500 });
      }
    }
  }

  return new Response("ok", { status: 200 });
}
