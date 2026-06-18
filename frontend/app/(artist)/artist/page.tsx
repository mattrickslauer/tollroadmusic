// /artist — the rightsholder dashboard. Reads the royalty summary from the
// backend (GET /v1/artist/summary → precomputed artist_daily_summary, never the
// raw ledger). Degrades gracefully: signed-out → sign-in prompt; listener-only
// account → a prompt to create an artist profile.
import Link from "next/link";
import { serverArtistSummary, apiConfigured, hasSessionCookie } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function ArtistDashboardPage() {
  const configured = apiConfigured();
  const session = configured ? await hasSessionCookie() : false;
  const summary = session ? await serverArtistSummary() : null;

  return (
    <main className="az-page wrap">
      <header className="az-head">
        <span className="eyebrow"><span className="dot" /><span className="mono-label">Artist dashboard</span></span>
        <h1 className="az-h1">
          {summary ? <>Welcome back, <span className="serif">{summary.artist.name}.</span></> : <>Your royalty <span className="serif">dashboard.</span></>}
        </h1>
        <p className="az-sub">Earnings are metered per minute actually played and reconciled to an auditable ledger.</p>
      </header>

      {!configured && (
        <p className="az-empty">Not configured yet — set <code>TOLLROAD_API_BASE</code> to the backend.</p>
      )}

      {configured && !session && (
        <div className="az-cta">
          <p>Sign in to view your earnings, or create an artist profile to start.</p>
          <Link className="btn btn-primary" href="/artist/join">Become an artist →</Link>
        </div>
      )}

      {configured && session && !summary && (
        <div className="az-cta">
          <p>This account doesn&apos;t have an artist profile yet.</p>
          <Link className="btn btn-primary" href="/artist/join">Create your artist profile →</Link>
        </div>
      )}

      {summary && (
        <>
          <div className="az-stats">
            <Stat k="Total earned" v={usd(summary.earningsCents)} green />
            <Stat k="Minutes played" v={summary.minutes.toLocaleString("en-US")} />
            <Stat k="Tracks" v={String(summary.trackCount)} />
            <Stat k="Genre" v={summary.artist.genre || "—"} />
          </div>

          <section className="az-recent">
            <h2 className="az-recent-h">Recent activity</h2>
            {summary.byDay.length === 0 ? (
              <p className="az-empty">No plays yet — once listeners start streaming your tracks, metered minutes show up here.</p>
            ) : (
              <table className="az-table">
                <thead>
                  <tr><th>Day</th><th>Minutes</th><th>Earned</th></tr>
                </thead>
                <tbody>
                  {summary.byDay.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.minutes.toLocaleString("en-US")}</td>
                      <td className="az-amt">{usd(d.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ k, v, green }: { k: string; v: string; green?: boolean }) {
  return (
    <div className="az-stat">
      <div className={`az-stat-v${green ? " green" : ""}`}>{v}</div>
      <div className="az-stat-k">{k}</div>
    </div>
  );
}
