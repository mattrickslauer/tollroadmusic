// POST /v1/charge { trackId } — the x402 PAYMENT step.
// Conditionally debits the caller's wallet by one metered minute and writes the
// append-only royalty-ledger row (idempotent per user+track+wall-clock-minute).
// Returns the x402 402 body when the balance can't cover the minute.
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { getTrackBilling } from "../domain/tracks.ts";
import { chargeMinute } from "../domain/billing.ts";
import { paymentRequired } from "../lib/x402.ts";

export const charge: Handler = async (req) => {
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  const session = await requireSession(req);

  const b = (req.body ?? {}) as Record<string, unknown>;
  const trackId = typeof b.trackId === "string" ? b.trackId : "";
  if (!trackId) return error(400, "trackId required");

  const track = await getTrackBilling(trackId);
  if (!track) return error(404, "no such track");

  const result = await chargeMinute({
    accountId: session.sub,
    trackId: track.id,
    artistId: track.artistId,
    amountCents: track.pricePerMinuteCents,
  });

  if (!result.ok) {
    // x402 payment-required — but include the live balance so the client can
    // decide whether to top up or simply retry after funds arrive.
    const res = paymentRequired({
      resource: `/v1/charge`,
      trackId: track.id,
      pricePerMinuteCents: track.pricePerMinuteCents,
      reason: "insufficient balance",
    });
    (res.body as Record<string, unknown>).balanceCents = result.balanceCents;
    return res;
  }
  return ok({ balanceCents: result.balanceCents, charged: result.charged });
};
