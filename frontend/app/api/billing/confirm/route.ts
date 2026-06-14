// POST /api/billing/confirm  { paymentIntentId }
// Called by the sheet right after Stripe confirms a top-up. We re-fetch the
// PaymentIntent server-side (never trust the client for the amount), verify it
// belongs to this listener, and credit the wallet. ACH debits settle later, so
// 'processing' is enough to provisionally credit; the webhook is the source of
// truth and is idempotent on the same PaymentIntent id, so no double credit.
import { readSession, sessionConfigured } from "@/lib/server/session";
import { dsqlConfigured } from "@/lib/dsql";
import { stripe, stripeConfigured } from "@/lib/server/stripe";
import { creditTopup, getBalanceCents } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREDITABLE = new Set(["succeeded", "processing", "requires_capture"]);

export async function POST(request: Request) {
  if (!sessionConfigured() || !dsqlConfigured()) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }
  if (!stripeConfigured()) {
    return Response.json({ error: "stripe not configured" }, { status: 503 });
  }
  const session = await readSession(request);
  if (!session) return Response.json({ error: "sign in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.paymentIntentId === "string" ? body.paymentIntentId : "";
  if (!id) return Response.json({ error: "paymentIntentId required" }, { status: 400 });

  let intent;
  try {
    intent = await stripe().paymentIntents.retrieve(id);
  } catch (err) {
    console.error("confirm: retrieve failed", err);
    return Response.json({ error: "could not verify payment" }, { status: 502 });
  }

  const meta = intent.metadata ?? {};
  if (meta.accountId !== session.sub) {
    return Response.json({ error: "not your payment" }, { status: 403 });
  }
  if (!CREDITABLE.has(intent.status)) {
    return Response.json(
      { error: "payment not complete", status: intent.status, balanceCents: await getBalanceCents(session.sub) },
      { status: 409 },
    );
  }

  const creditCents = Number(meta.creditCents) || 0;
  const feeCents = Number(meta.feeCents) || 0;
  const method = meta.method === "card" ? "card" : "ach";
  const { balanceCents } = await creditTopup({
    accountId: session.sub,
    paymentRef: intent.id,
    amountCents: creditCents,
    feeCents,
    method,
    status: intent.status,
  });

  return Response.json({ balanceCents, status: intent.status });
}
