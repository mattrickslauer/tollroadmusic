import { type Handler, ok, error, requireSession, NO_STORE, HttpError } from "../lib/http.ts";
import { dsqlConfigured } from "../lib/dsql.ts";
import { stripe, stripeConfigured } from "../domain/stripe.ts";
import { artistIdForAccount } from "../domain/artist-content.ts";
import {
  payableCents,
  getAvailableMillicents,
  getArtistPayoutInfo,
  setConnectAccount,
  setPayoutsEnabled,
  reserveWithdrawal,
  markWithdrawalPaid,
  markWithdrawalFailed,
  listPayouts,
} from "../domain/payouts.ts";

async function requireArtist(accountId: string): Promise<string> {
  const id = await artistIdForAccount(accountId);
  if (!id) throw new HttpError(403, "not an artist");
  return id;
}

// Where Stripe returns the artist after hosted onboarding. The dashboard reads
// ?payouts=return and re-fetches status.
function appBase(): string {
  return (process.env.TOLLROAD_APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** POST /artist/payouts/onboard — create the Express account if needed, return a
 *  Stripe-hosted onboarding link. */
export const onboard: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  if (!stripeConfigured()) return error(503, "payouts not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);

  let { stripeAccountId } = await getArtistPayoutInfo(artistId);
  if (!stripeAccountId) {
    const acct = await stripe().accounts.create({
      type: "express",
      capabilities: { transfers: { requested: true } },
      metadata: { artistId },
    });
    stripeAccountId = acct.id;
    await setConnectAccount(artistId, stripeAccountId);
  }

  const link = await stripe().accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appBase()}/artist?payouts=refresh`,
    return_url: `${appBase()}/artist?payouts=return`,
    type: "account_onboarding",
  });
  return ok({ url: link.url }, NO_STORE);
};

/** GET /artist/payouts/status — refresh payouts_enabled from Stripe, return the
 *  dashboard payout state. */
export const status: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);

  const info = await getArtistPayoutInfo(artistId);
  let payoutsEnabled = info.payoutsEnabled;

  if (info.stripeAccountId && stripeConfigured()) {
    const acct = await stripe().accounts.retrieve(info.stripeAccountId);
    payoutsEnabled = Boolean(acct.payouts_enabled && acct.details_submitted);
    if (payoutsEnabled !== info.payoutsEnabled) await setPayoutsEnabled(artistId, payoutsEnabled);
  }

  const [availableMillicents, history] = [
    await getAvailableMillicents(artistId),
    await listPayouts(artistId),
  ];
  return ok(
    { connected: Boolean(info.stripeAccountId), payoutsEnabled, availableMillicents, history },
    NO_STORE,
  );
};

/** POST /artist/payouts/withdraw — reserve, transfer, finalize. Concurrency-safe
 *  via the reserve-then-transfer ledger row. */
export const withdraw: Handler = async (req) => {
  if (!dsqlConfigured()) return error(503, "not configured");
  if (!stripeConfigured()) return error(503, "payouts not configured");
  const s = await requireSession(req);
  const artistId = await requireArtist(s.sub);

  const info = await getArtistPayoutInfo(artistId);
  if (!info.stripeAccountId || !info.payoutsEnabled) {
    return error(400, "complete payout setup first");
  }

  const reserved = await reserveWithdrawal(artistId);
  if (!reserved.ok) return error(400, "nothing to withdraw");

  try {
    const transfer = await stripe().transfers.create(
      {
        amount: reserved.payableCents,
        currency: "usd",
        destination: info.stripeAccountId,
        metadata: { artistId, payoutId: reserved.payoutId },
      },
      { idempotencyKey: `payout:${reserved.payoutId}` },
    );
    await markWithdrawalPaid(reserved.payoutId, transfer.id);
  } catch (err) {
    await markWithdrawalFailed(reserved.payoutId);
    console.error("withdraw: stripe transfer failed", err);
    return error(502, "transfer failed — no funds were moved");
  }

  const availableMillicents = await getAvailableMillicents(artistId);
  return ok(
    { transferId: reserved.payoutId, paidMillicents: reserved.payableCents * 1000, availableMillicents },
    NO_STORE,
  );
};
