// Wallet — balance + history, top-up (Stripe PaymentIntent or demo credit), and
// confirm. Ports app/api/billing/* from the front-end.
import { randomUUID } from "node:crypto";
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { stripe, stripeConfigured, publishableKey } from "../domain/stripe.ts";
import { TOPUP_CENTS, cardFeeCents, creditTopup, getBalanceCents, getListeningHistory } from "../domain/billing.ts";

export const balance: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  const session = await requireSession(req);
  const [balanceCents, history] = await Promise.all([
    getBalanceCents(session.sub),
    getListeningHistory(session.sub),
  ]);
  return ok({ balanceCents, history });
};

/** POST /v1/wallet/topup { method } — start a $10 top-up (or signal demo mode). */
export const topup: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  const session = await requireSession(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const method = b.method === "card" ? "card" : "ach";

  const creditCents = TOPUP_CENTS;
  const feeCents = method === "card" ? cardFeeCents(creditCents) : 0;
  const chargeCents = creditCents + feeCents;

  if (!stripeConfigured()) return ok({ demo: true, method, creditCents, feeCents, chargeCents });

  try {
    const intent = await stripe().paymentIntents.create({
      amount: chargeCents,
      currency: "usd",
      payment_method_types: [method === "card" ? "card" : "us_bank_account"],
      metadata: {
        accountId: session.sub,
        creditCents: String(creditCents),
        feeCents: String(feeCents),
        method,
        purpose: "wallet_topup",
      },
    });
    return ok({
      demo: false,
      clientSecret: intent.client_secret,
      publishableKey: publishableKey(),
      method,
      creditCents,
      feeCents,
      chargeCents,
    });
  } catch (err) {
    console.error("topup create-intent failed", err);
    return error(502, "could not start payment");
  }
};

/** POST /v1/wallet/demo-credit — local fallback when Stripe isn't configured. */
export const demoCredit: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  if (stripeConfigured()) return error(409, "use the live payment flow");
  const session = await requireSession(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const method = b.method === "card" ? "card" : "ach";
  const feeCents = method === "card" ? cardFeeCents(TOPUP_CENTS) : 0;

  const { balanceCents } = await creditTopup({
    accountId: session.sub,
    paymentRef: `demo#${randomUUID()}`,
    amountCents: TOPUP_CENTS,
    feeCents,
    method: "demo",
    status: "succeeded",
  });
  return ok({ balanceCents, demo: true });
};

const CREDITABLE = new Set(["succeeded", "processing", "requires_capture"]);

/** POST /v1/wallet/confirm { paymentIntentId } — credit after Stripe confirms. */
export const confirm: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  if (!stripeConfigured()) return error(503, "stripe not configured");
  const session = await requireSession(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const id = typeof b.paymentIntentId === "string" ? b.paymentIntentId : "";
  if (!id) return error(400, "paymentIntentId required");

  let intent;
  try {
    intent = await stripe().paymentIntents.retrieve(id);
  } catch (err) {
    console.error("confirm: retrieve failed", err);
    return error(502, "could not verify payment");
  }
  const meta = intent.metadata ?? {};
  if (meta.accountId !== session.sub) return error(403, "not your payment");
  if (!CREDITABLE.has(intent.status)) {
    return json409(intent.status, await getBalanceCents(session.sub));
  }

  const { balanceCents } = await creditTopup({
    accountId: session.sub,
    paymentRef: intent.id,
    amountCents: Number(meta.creditCents) || 0,
    feeCents: Number(meta.feeCents) || 0,
    method: meta.method === "card" ? "card" : "ach",
    status: intent.status,
  });
  return ok({ balanceCents, status: intent.status });
};

function json409(status: string, balanceCents: number) {
  return { status: 409, body: { error: "payment not complete", status, balanceCents } };
}
