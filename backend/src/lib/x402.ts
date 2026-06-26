// x402 — the metered-payment protocol, crypto-free.
//
// We follow the x402 SHAPE (HTTP 402 + machine-readable payment requirements +
// request→402→pay→retry), but the settlement rail is the listener's prepaid
// wallet reconciled in Aurora DSQL — NOT a blockchain. A consumer (browser, a
// third-party app, or an AI agent holding an API key) that requests a paid
// resource without a recent paid minute gets a 402 describing exactly what to
// pay and where; it calls the charge endpoint, then retries.
//
//   GET /v1/stream/{track}          -> 402 { accepts: [ { scheme:"prepaid", ... } ] }
//   POST /v1/charge { trackId }     -> 200 { balanceMillicents }   (the payment)
//   GET /v1/stream/{track}          -> 200 { url }            (now authorized)
import { type ApiResponse } from "./http.ts";

export const X402_VERSION = 1;

export interface PaymentRequirements {
  /** Settlement scheme. "prepaid" = debit the caller's TollRoad wallet balance. */
  scheme: "prepaid";
  /** Logical settlement network. */
  network: "tollroad";
  /** Currency of `maxAmountRequired`. */
  asset: "usd";
  /** Price to satisfy this request, in millicents (one metered minute). */
  maxAmountRequired: number;
  /** The protected resource path. */
  resource: string;
  description: string;
  mimeType: string;
  /** Where to send the payment (the charge endpoint). */
  payTo: string;
  /** Convenience: top up the wallet if the balance can't cover the charge. */
  topUpUrl: string;
  /** Per-minute rate in millicents, echoed for clients that want to show a meter. */
  pricePerMinuteMillicents: number;
}

export interface PaymentRequiredBody {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
}

/** Build a 402 Payment Required response describing how to pay for a track. */
export function paymentRequired(opts: {
  resource: string;
  trackId: string;
  pricePerMinuteMillicents: number;
  reason?: string;
}): ApiResponse {
  const body: PaymentRequiredBody = {
    x402Version: X402_VERSION,
    error: opts.reason ?? "payment required",
    accepts: [
      {
        scheme: "prepaid",
        network: "tollroad",
        asset: "usd",
        maxAmountRequired: opts.pricePerMinuteMillicents,
        resource: opts.resource,
        description: `One metered minute of track ${opts.trackId}`,
        mimeType: "audio/mpeg",
        payTo: "/v1/charge",
        topUpUrl: "/v1/wallet/topup",
        pricePerMinuteMillicents: opts.pricePerMinuteMillicents,
      },
    ],
  };
  return {
    status: 402,
    body,
    headers: {
      "Cache-Control": "no-store",
      // Advertise the scheme so generic x402 clients can discover it.
      "Accept-Payment": "prepaid",
    },
  };
}
