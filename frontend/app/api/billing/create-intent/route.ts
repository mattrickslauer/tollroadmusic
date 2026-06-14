// POST /api/billing/create-intent  { method: 'ach' | 'card' }
// Start a $10 wallet top-up. ACH (us_bank_account) charges the face value; card
// adds Stripe's processing fee on top (passed to the listener). Returns the
// PaymentIntent client secret + the amounts so the sheet can show the breakdown.
// When Stripe isn't configured, returns { demo: true } and the client uses the
// demo-credit path instead.
import { readSession, sessionConfigured } from "@/lib/server/session";
import { dsqlConfigured } from "@/lib/dsql";
import { stripe, stripeConfigured, publishableKey } from "@/lib/server/stripe";
import { TOPUP_CENTS, cardFeeCents } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sessionConfigured() || !dsqlConfigured()) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }
  const session = await readSession(request);
  if (!session) return Response.json({ error: "sign in to add funds" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const method = body?.method === "card" ? "card" : "ach";

  const creditCents = TOPUP_CENTS;
  const feeCents = method === "card" ? cardFeeCents(creditCents) : 0;
  const chargeCents = creditCents + feeCents;

  // No Stripe keys → tell the client to use the demo-credit path.
  if (!stripeConfigured()) {
    return Response.json({ demo: true, method, creditCents, feeCents, chargeCents });
  }

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
    return Response.json({
      demo: false,
      clientSecret: intent.client_secret,
      publishableKey: publishableKey(),
      method,
      creditCents,
      feeCents,
      chargeCents,
    });
  } catch (err) {
    console.error("create-intent failed", err);
    return Response.json({ error: "could not start payment" }, { status: 502 });
  }
}
