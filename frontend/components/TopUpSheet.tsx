"use client";

import { useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

type Method = "ach" | "card";

interface Quote {
  demo: boolean;
  method: Method;
  creditCents: number;
  feeCents: number;
  chargeCents: number;
  clientSecret?: string;
  publishableKey?: string;
}

interface Props {
  /** Optional context line, e.g. "You're out of funds." */
  reason?: string;
  onClose: () => void;
  /** Called with the new balance (cents) once the wallet is funded. */
  onFunded: (balanceCents: number) => void;
}

const TOPUP_CENTS = 1000;
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
// Mirror the server: Stripe's 2.9% + 30¢, rounded up. Display only.
const cardFee = (c: number) => Math.ceil(c * 0.029) + 30;

// loadStripe must be called once per publishable key, outside render churn.
let stripePromise: Promise<Stripe | null> | null = null;
let stripePromiseKey = "";
function getStripe(pk: string): Promise<Stripe | null> {
  if (!stripePromise || stripePromiseKey !== pk) {
    stripePromise = loadStripe(pk);
    stripePromiseKey = pk;
  }
  return stripePromise;
}

/**
 * Add funds to the listener wallet: $10 via ACH bank debit (no added fee) or
 * card (the card processing fee is added to the charge). Mounts Stripe's
 * PaymentElement for the real flow; falls back to an instant demo credit when
 * Stripe isn't configured on the server.
 */
export default function TopUpSheet({ reason, onClose, onFunded }: Props) {
  const [method, setMethod] = useState<Method>("ach");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeCents = method === "card" ? cardFee(TOPUP_CENTS) : 0;
  const chargeCents = TOPUP_CENTS + feeCents;

  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/create-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not start payment.");
        return;
      }
      if (data.demo) {
        const cr = await fetch("/api/billing/demo-credit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method }),
        });
        const cd = await cr.json().catch(() => null);
        if (!cr.ok) {
          setError(cd?.error ?? "Could not add funds.");
          return;
        }
        onFunded(cd.balanceCents);
        return;
      }
      setQuote(data as Quote);
    } finally {
      setPending(false);
    }
  }

  const stripe = useMemo(
    () => (quote?.clientSecret && quote.publishableKey ? getStripe(quote.publishableKey) : null),
    [quote?.clientSecret, quote?.publishableKey],
  );

  return (
    <div className="auth-overlay" onMouseDown={onClose}>
      <div className="auth-sheet wallet-sheet" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="auth-close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="auth-title">Add funds</h2>
        <p className="auth-sub">{reason ?? "Top up your wallet to start listening — the meter draws from this balance."}</p>

        {!quote && (
          <>
            <div className="topup-methods">
              <button
                className="topup-method"
                data-on={method === "ach"}
                onClick={() => setMethod("ach")}
                type="button"
              >
                <span className="topup-method-name">Bank account · ACH</span>
                <span className="topup-method-sub">No added fee</span>
                <span className="topup-method-amt">{usd(TOPUP_CENTS)}</span>
              </button>
              <button
                className="topup-method"
                data-on={method === "card"}
                onClick={() => setMethod("card")}
                type="button"
              >
                <span className="topup-method-name">Card</span>
                <span className="topup-method-sub">+{usd(cardFee(TOPUP_CENTS))} processing fee</span>
                <span className="topup-method-amt">{usd(TOPUP_CENTS + cardFee(TOPUP_CENTS))}</span>
              </button>
            </div>

            <div className="topup-breakdown">
              <div><span>Wallet credit</span><span>{usd(TOPUP_CENTS)}</span></div>
              {feeCents > 0 && <div><span>Card processing fee</span><span>{usd(feeCents)}</span></div>}
              <div className="topup-total"><span>You pay</span><span>{usd(chargeCents)}</span></div>
            </div>

            {error && <p className="auth-error">{error}</p>}
            <button className="btn btn-primary auth-go" disabled={pending} onClick={start}>
              {pending ? "Starting…" : `Continue — ${usd(chargeCents)} →`}
            </button>
          </>
        )}

        {quote?.clientSecret && stripe && (
          <Elements stripe={stripe} options={{ clientSecret: quote.clientSecret }}>
            <PayForm
              chargeCents={quote.chargeCents}
              onFunded={onFunded}
              onError={setError}
              onBack={() => { setQuote(null); setError(null); }}
              error={error}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

function PayForm({
  chargeCents,
  onFunded,
  onError,
  onBack,
  error,
}: {
  chargeCents: number;
  onFunded: (cents: number) => void;
  onError: (msg: string) => void;
  onBack: () => void;
  error: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [pending, setPending] = useState(false);

  async function pay() {
    if (!stripe || !elements || pending) return;
    setPending(true);
    onError("");
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (err) {
      onError(err.message ?? "Payment failed.");
      setPending(false);
      return;
    }
    const res = await fetch("/api/billing/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentIntentId: paymentIntent?.id }),
    });
    const data = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      onError(data?.error ?? "Could not confirm payment.");
      return;
    }
    onFunded(data.balanceCents);
  }

  return (
    <div className="topup-pay">
      <PaymentElement />
      {error && <p className="auth-error">{error}</p>}
      <button className="btn btn-primary auth-go" disabled={!stripe || pending} onClick={pay}>
        {pending ? "Processing…" : `Pay ${usd(chargeCents)} →`}
      </button>
      <button className="auth-link" onClick={onBack} disabled={pending}>← Change method</button>
    </div>
  );
}
