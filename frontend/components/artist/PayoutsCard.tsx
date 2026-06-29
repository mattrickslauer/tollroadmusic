"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPayoutStatus,
  startPayoutOnboarding,
  withdrawPayout,
  ApiError,
} from "@/lib/api/client";
import type { PayoutStatus } from "@/lib/api/types";
import { derivePayoutState } from "@/lib/payoutState";

const usdM = (m: number) => `$${(m / 100000).toFixed(2)}`;

export default function PayoutsCard() {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getPayoutStatus());
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "could not load payouts");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onConnect() {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await startPayoutOnboarding();
      window.location.href = url;
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "could not start setup");
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await withdrawPayout();
      setMsg(`Sent ${usdM(r.paidMillicents)} to your account.`);
      await refresh();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  const state = derivePayoutState(status);

  return (
    <section className="az-card">
      <h2 className="az-card-title">Payouts</h2>

      {state === "loading" && <p className="az-muted">Loading…</p>}

      {state === "not-connected" && (
        <>
          <p className="az-muted">Connect a payout account to withdraw your earnings.</p>
          <button className="btn btn-primary" onClick={onConnect} disabled={busy}>
            Set up payouts →
          </button>
        </>
      )}

      {state === "incomplete" && (
        <>
          <p className="az-muted">Your payout setup isn&apos;t finished yet.</p>
          <button className="btn btn-primary" onClick={onConnect} disabled={busy}>
            Resume setup →
          </button>
        </>
      )}

      {state === "ready" && status && (
        <>
          <p className="az-balance">
            Available: <strong>{usdM(status.availableMillicents)}</strong>
          </p>
          <button
            className="btn btn-primary"
            onClick={onWithdraw}
            disabled={busy || status.availableMillicents < 1000}
          >
            {busy ? "Processing…" : "Withdraw"}
          </button>
          {status.history.length > 0 && (
            <ul className="az-payout-history">
              {status.history.map((h) => (
                <li key={h.id}>
                  {usdM(h.amountMillicents)} — {h.status} —{" "}
                  {new Date(h.createdAt).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {msg && <p className="az-note">{msg}</p>}
    </section>
  );
}
