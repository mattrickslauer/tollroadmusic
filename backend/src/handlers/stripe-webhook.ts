// POST /v1/stripe/webhook — Stripe's authoritative top-up signal. Verifies the
// signature with STRIPE_WEBHOOK_SECRET, then credits the wallet idempotently.
// Ports app/api/billing/webhook. Needs the RAW body for signature verification.
import { type Handler, header } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { stripe, stripeConfigured, webhookSecret } from "../domain/stripe.ts";
import { creditTopup } from "../domain/billing.ts";
import { notifyPayment } from "../domain/notify.ts";
import type Stripe from "stripe";

export const webhook: Handler = async (req) => {
  if (!stripeConfigured() || !dsqlConfigured()) {
    return { status: 503, raw: { contentType: "text/plain", data: "billing not configured" } };
  }
  const secret = webhookSecret();
  if (!secret) return { status: 503, raw: { contentType: "text/plain", data: "webhook secret not set" } };

  const sig = header(req, "stripe-signature");
  if (!sig) return { status: 400, raw: { contentType: "text/plain", data: "missing signature" } };

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(req.rawBody, sig, secret);
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return { status: 400, raw: { contentType: "text/plain", data: "bad signature" } };
  }

  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.processing") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const meta = pi.metadata ?? {};
    if (meta.purpose === "wallet_topup" && meta.accountId) {
      const method = meta.method === "card" ? "card" : "ach";
      let result;
      try {
        result = await creditTopup({
          accountId: meta.accountId,
          paymentRef: pi.id,
          amountCents: Number(meta.creditCents) || 0,
          feeCents: Number(meta.feeCents) || 0,
          method,
          status: pi.status,
        });
      } catch (err) {
        console.error("webhook credit failed", err);
        return { status: 500, raw: { contentType: "text/plain", data: "credit failed" } };
      }
      // Ping the Telegram group only on a fresh credit (creditTopup is
      // idempotent on pi.id, so webhook redelivery / the ACH succeeded-after-
      // processing event won't double-notify). Never throws — can't 500 the
      // webhook and trigger a Stripe retry.
      if (result.credited) {
        await notifyPayment({
          amount: `$${((Number(meta.creditCents) || 0) / 100).toFixed(2)}`,
          method,
          status: pi.status,
          account: meta.accountId,
          "new balance": `$${(result.balanceCents / 100).toFixed(2)}`,
          ref: pi.id,
        });
      }
    }
  }
  return { status: 200, raw: { contentType: "text/plain", data: "ok" } };
};
