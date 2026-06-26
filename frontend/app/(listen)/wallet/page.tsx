// /wallet — the listener's balance + streaming history. Server component: reads
// the session cookie and loads the wallet from the backend API (server→server).
// Chrome (sidebar + player) comes from the (listen) layout.
import WalletPanel from "@/components/WalletPanel";
import type { HistoryRow } from "@/lib/api/types";
import { serverBalance, apiConfigured, hasSessionCookie } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const configured = apiConfigured();
  const session = configured ? await hasSessionCookie() : false;

  let balanceMillicents = 0;
  let history: HistoryRow[] = [];
  let error: string | null = null;
  if (session) {
    try {
      const wallet = await serverBalance();
      balanceMillicents = wallet.balanceMillicents;
      history = wallet.history;
    } catch (e) {
      console.error("wallet: load failed", e);
      error = "Could not load your wallet right now.";
    }
  }

  return (
    <>
      <header className="lx-head">
        <span className="lx-eyebrow">Your wallet</span>
        <h1 className="lx-h1">Balance &amp; streaming history.</h1>
        <p className="lx-sub">Every minute you listen is drawn from your prepaid balance. Here&apos;s what you have and what you&apos;ve played.</p>
      </header>

      {!configured && (
        <p className="lx-empty">Wallet isn&apos;t configured yet — set <code>TOLLROAD_API_BASE</code> to the backend.</p>
      )}
      {configured && !session && (
        <p className="lx-empty">Sign in to view your wallet and streaming history.</p>
      )}
      {error && <p className="lx-empty">{error}</p>}
      {session && !error && <WalletPanel initialBalanceMillicents={balanceMillicents} history={history} />}
    </>
  );
}
