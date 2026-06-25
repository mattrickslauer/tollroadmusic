"use client";

// The artist-page superfan leaderboard. Fetches the top backers (getLeaderboard)
// on mount and renders them ranked by bond points, each with their @handle,
// display name, and tier badge. #1 wears a crown. An empty roster invites the
// viewer to be the first superfan. Never throws — any error degrades to the
// empty state, so the artist page can mount it unconditionally.
//
// Self-highlight: the viewer's own handle isn't trivially available in this
// page's data, so we intentionally skip self-highlighting rather than guess.

import { useEffect, useState } from "react";
import * as api from "@/lib/api/client";
import type { LeaderboardEntry } from "@/lib/api/types";
import { resolveTier } from "@/lib/bond/bondConfig";

export default function SuperfanLeaderboard({
  artistId,
  limit = 50,
}: {
  artistId: string;
  limit?: number;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [totalFans, setTotalFans] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getLeaderboard(artistId, limit)
      .then((lb) => {
        if (!alive) return;
        setEntries(lb.entries);
        setTotalFans(lb.totalFans);
      })
      .catch(() => {
        if (alive) setEntries([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [artistId, limit]);

  return (
    <section className="lx-leaderboard" aria-label="Superfan leaderboard">
      <header className="lx-leaderboard-head">
        <h2 className="lx-section-h lx-leaderboard-title">Top Backers</h2>
        {totalFans > 0 && (
          <span className="lx-leaderboard-count">
            {totalFans.toLocaleString()} {totalFans === 1 ? "fan" : "fans"}
          </span>
        )}
      </header>

      {loading ? (
        <LeaderboardSkeleton />
      ) : !entries || entries.length === 0 ? (
        <p className="lx-leaderboard-empty">Be the first superfan. 👑</p>
      ) : (
        <ol className="lx-leaderboard-list">
          {entries.map((e) => {
            const tierIndex = resolveTier(e.bondPoints).index;
            const first = e.rank === 1;
            return (
              <li
                key={`${e.rank}-${e.handle}`}
                className="lx-leaderboard-row"
                data-first={first ? "true" : undefined}
              >
                <span className="lx-leaderboard-rank">
                  {first ? <span className="lx-leaderboard-crown" aria-label="Top backer">👑</span> : `#${e.rank}`}
                </span>
                <span className="lx-leaderboard-fan">
                  <span className="lx-leaderboard-name">{e.displayName || e.handle}</span>
                  {e.handle && <span className="lx-leaderboard-handle">@{e.handle}</span>}
                </span>
                <span className="lx-leaderboard-tier" data-tier={tierIndex}>
                  {e.tier}
                </span>
                <span className="lx-leaderboard-bp">
                  {e.bondPoints.toLocaleString()}
                  <small>BP</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LeaderboardSkeleton() {
  return (
    <ol className="lx-leaderboard-list" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="lx-leaderboard-row lx-leaderboard-row-sk">
          <span className="lx-sk" style={{ width: 22, height: 16 }} />
          <span className="lx-leaderboard-fan">
            <span className="lx-sk" style={{ width: 120, height: 13 }} />
            <span className="lx-sk" style={{ width: 70, height: 11, marginTop: 5 }} />
          </span>
          <span className="lx-sk" style={{ width: 58, height: 20, borderRadius: 999 }} />
          <span className="lx-sk" style={{ width: 44, height: 14 }} />
        </li>
      ))}
    </ol>
  );
}
