// POST /api/billing/demo-credit  { method?: 'ach' | 'card' }
// Local/demo fallback for when Stripe isn't configured: credits the $10 face
// value to the listener's wallet immediately so the funds→play loop is testable
// without real payments. Refused when Stripe IS configured (use the real flow).
import { randomUUID } from "node:crypto";
import { readSession, sessionConfigured } from "@/lib/server/session";
import { dsqlConfigured } from "@/lib/dsql";
import { stripeConfigured } from "@/lib/server/stripe";
import { creditTopup, TOPUP_CENTS, cardFeeCents } from "@/lib/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sessionConfigured() || !dsqlConfigured()) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }
  // Guard: never hand out free money once real payments are wired up.
  if (stripeConfigured()) {
    return Response.json({ error: "use the live payment flow" }, { status: 409 });
  }
  const session = await readSession(request);
  if (!session) return Response.json({ error: "sign in to add funds" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const method = body?.method === "card" ? "card" : "ach";
  const feeCents = method === "card" ? cardFeeCents(TOPUP_CENTS) : 0;

  const { balanceCents } = await creditTopup({
    accountId: session.sub,
    paymentRef: `demo#${randomUUID()}`,
    amountCents: TOPUP_CENTS,
    feeCents,
    method: "demo",
    status: "succeeded",
  });
  return Response.json({ balanceCents, demo: true });
}
