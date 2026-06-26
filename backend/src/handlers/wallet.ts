// Wallet — balance + history, top-up (Stripe PaymentIntent or demo credit), and
// confirm. Ports app/api/billing/* from the front-end.
import { randomUUID } from "node:crypto";
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { stripe, stripeConfigured, publishableKey } from "../domain/stripe.ts";
import {
  TOPUP_MILLICENTS,
  cardFeeCents,
  creditTopup,
  creditOnboardingGift,
  getBalanceMillicents,
  getListeningHistory,
  millicentsToStripeCents,
  stripeCentsToMillicents,
} from "../domain/billing.ts";
import { walletStoreConfigured, getRealtimeBalance } from "../domain/wallet-store.ts";

// The displayed balance is the AUTHORITATIVE real-time balance (DynamoDB) when
// the wallet store is configured; only the laptop-demo fallback reads the DSQL
// reconciliation balance. History is always the DSQL read model.
async function liveBalance(accountId: string): Promise<number> {
  return walletStoreConfigured() ? getRealtimeBalance(accountId) : getBalanceMillicents(accountId);
}

export const balance: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  const session = await requireSession(req);
  const [balanceMillicents, history] = await Promise.all([
    liveBalance(session.sub),
    getListeningHistory(session.sub),
  ]);
  return ok({ balanceMillicents, history });
};

/** POST /v1/wallet/topup { method } — start a $10 top-up (or signal demo mode). */
export const topup: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  const session = await requireSession(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const method = b.method === "card" ? "card" : "ach";

  // Stripe operates in whole cents; convert millicents at the boundary.
  const creditCents = millicentsToStripeCents(TOPUP_MILLICENTS);
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
  const creditCents = millicentsToStripeCents(TOPUP_MILLICENTS);
  const feeCents = method === "card" ? cardFeeCents(creditCents) : 0;

  const { balanceMillicents } = await creditTopup({
    accountId: session.sub,
    paymentRef: `demo#${randomUUID()}`,
    amountMillicents: TOPUP_MILLICENTS,
    feeCents,
    method: "demo",
    status: "succeeded",
  });
  return ok({ balanceMillicents, demo: true });
};

/** POST /v1/wallet/onboarding-gift — grant the one-time $3 welcome balance.
 *  Idempotent: a second call returns credited:false with the current balance. */
export const onboardingGift: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  const session = await requireSession(req);
  const { credited, balanceMillicents } = await creditOnboardingGift(session.sub);
  return ok({ credited, balanceMillicents });
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
    return json409(intent.status, await liveBalance(session.sub));
  }

  const { balanceMillicents } = await creditTopup({
    accountId: session.sub,
    paymentRef: intent.id,
    // Convert Stripe cents from metadata back to millicents at the boundary.
    amountMillicents: stripeCentsToMillicents(Number(meta.creditCents) || 0),
    feeCents: Number(meta.feeCents) || 0,
    method: meta.method === "card" ? "card" : "ach",
    status: intent.status,
  });
  return ok({ balanceMillicents, status: intent.status });
};

function json409(status: string, balanceMillicents: number) {
  return { status: 409, body: { error: "payment not complete", status, balanceMillicents } };
}
