// POST /v1/charge { trackId } — the x402 PAYMENT step.
// Conditionally debits the caller's wallet by one metered minute. The debit and
// its METER event are written together in DynamoDB (the command store); the
// METER event then streams to the projector, which builds the DSQL royalty
// ledger. The command path NO LONGER writes the DSQL ledger synchronously.
// Returns the x402 402 body when the balance can't cover the minute.
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { getTrackBilling } from "../domain/tracks.ts";
import { currentMinuteEpoch, localDsqlBilling, chargeMinuteLocalDsql } from "../domain/billing.ts";
import { walletStoreConfigured, debitMinute } from "../domain/wallet-store.ts";
import { paymentRequired } from "../lib/x402.ts";

export const charge: Handler = async (req) => {
  // Track metadata lives in DSQL, so dsqlConfigured() is required regardless of
  // the billing backend. The billing backend is DynamoDB (prod) or, only under
  // the explicit local opt-in, the legacy DSQL-direct path.
  if (!sessionConfigured() || !dsqlConfigured()) return error(503, "billing not configured");
  const useDynamo = walletStoreConfigured();
  if (!useDynamo && !localDsqlBilling()) return error(503, "billing not configured");
  const session = await requireSession(req);

  const b = (req.body ?? {}) as Record<string, unknown>;
  const trackId = typeof b.trackId === "string" ? b.trackId : "";
  if (!trackId) return error(400, "trackId required");

  const track = await getTrackBilling(trackId);
  if (!track) return error(404, "no such track");

  // Pin the wall-clock minute so the balance debit and the METER event share one
  // idempotency key (`<user>#<track>#<minute>`) — a duplicate minute is a no-op.
  const minuteEpoch = currentMinuteEpoch();
  const charged = {
    accountId: session.sub,
    trackId: track.id,
    artistId: track.artistId,
    amountCents: track.pricePerMinuteCents,
    minuteEpoch,
  };
  // debitMinute writes the balance debit + METER event in ONE transaction, so
  // there is no separate best-effort emit anymore.
  const result = useDynamo ? await debitMinute(charged) : await chargeMinuteLocalDsql(charged);

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
