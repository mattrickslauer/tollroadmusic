// /wallet — the listener's balance + streaming history. Server component: reads
// the session from the cookie and loads the wallet straight from DSQL.
import Link from "next/link";
import { cookies } from "next/headers";
import BrandMark from "@/components/BrandMark";
import AuthButton from "@/components/AuthButton";
import WalletPanel from "@/components/WalletPanel";
import { SESSION_COOKIE, verifySessionToken, sessionConfigured } from "@/lib/server/session";
import { getBalanceCents, getListeningHistory } from "@/lib/server/billing";
import { dsqlConfigured } from "@/lib/dsql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const configured = sessionConfigured() && dsqlConfigured();
  const token = configured ? (await cookies()).get(SESSION_COOKIE)?.value : undefined;
  const session = token ? await verifySessionToken(token) : null;

  let balanceCents = 0;
  let history: Awaited<ReturnType<typeof getListeningHistory>> = [];
  let error: string | null = null;
  if (session) {
    try {
      [balanceCents, history] = await Promise.all([
        getBalanceCents(session.sub),
        getListeningHistory(session.sub),
      ]);
    } catch (e) {
      console.error("wallet: load failed", e);
      error = "Could not load your wallet right now.";
    }
  }

  return (
    <>
      <nav className="nav">
        <div className="wrap nav-inner">
          <Link href="/" className="brand">
            <BrandMark />
            TollRoad
          </Link>
          <div className="nav-links">
            <Link href="/">Home</Link>
            <Link href="/browse">Browse</Link>
            <AuthButton />
          </div>
        </div>
      </nav>

      <header className="cat-head">
        <div className="wrap">
          <span className="eyebrow"><span className="dot" /><span className="mono-label">Your wallet</span></span>
          <h1 className="cat-h1">Balance &amp; <span className="serif">streaming history.</span></h1>
          <p className="cat-sub">Every minute you listen is drawn from your prepaid balance. Here&apos;s what you have and what you&apos;ve played.</p>
        </div>
      </header>

      <main className="wrap cat-main">
        {!configured && (
          <p className="cat-empty">Wallet isn&apos;t configured yet — set <code>TOLLROAD_DSQL_ENDPOINT</code> and the auth secret.</p>
        )}
        {configured && !session && (
          <p className="cat-empty">Sign in to view your wallet and streaming history.</p>
        )}
        {error && <p className="cat-empty">{error}</p>}
        {session && !error && <WalletPanel initialBalanceCents={balanceCents} history={history} />}
      </main>
    </>
  );
}
