"use client";

// The artist-page Superfan Bond card. Fetches the viewer's authoritative bond
// with this artist (getBond) on mount and renders the tier badge, bond points,
// a progress bar toward the next tier, the viewer's backer rank, and a streak
// flame. While the SAME artist is the one currently playing, it reflects the
// optimistic live bond from <BondProvider> so the card ticks up in real time;
// the server fetch stays the source of truth and re-anchors on every load.
//
// It NEVER throws: a 404 (no bond yet) or any error degrades to an inviting
// zero state ("press play to become a backer"), so the artist page can mount
// this unconditionally.

import { useEffect, useState } from "react";
import * as api from "@/lib/api/client";
import type { Bond } from "@/lib/api/types";
import { useBond } from "@/context/BondProvider";
import { TIERS, progressToNext } from "@/lib/bond/bondConfig";

const TOP_TIER_INDEX = TIERS.length - 1;

export default function BondCard({
  artistId,
  artistName,
}: {
  artistId: string;
  artistName?: string;
}) {
  const [bond, setBond] = useState<Bond | null>(null);
  const [loading, setLoading] = useState(true);
  const { live } = useBond();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .getBond(artistId)
      .then((b) => {
        if (alive) setBond(b);
      })
      .catch(() => {
        // 404 / signed-out / unconfigured → treat as an empty bond, never crash.
        if (alive) setBond(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [artistId]);

  if (loading) return <BondCardSkeleton />;

  // Authoritative bond from the server, defaulted to a zero state on error/404.
  const points = bond?.bondPoints ?? 0;
  const serverTierIndex = bond?.tierIndex ?? 0;
  const serverTier = bond?.tier ?? TIERS[0].name;
  const serverProgress = bond?.progressToNext ?? 0;

  // Optimistic overlay: if THIS artist is the one currently playing, the live
  // bond is at least as fresh as the server value — reflect it so the card ticks
  // while the listener earns. (Authoritative source is still getBond above.)
  const isLive = live.artistId === artistId && live.bondPoints >= points;
  const bondPoints = isLive ? live.bondPoints : points;
  const tierIndex = isLive ? live.tierIndex : serverTierIndex;
  const tier = isLive ? live.tier : serverTier;
  const progress = isLive ? progressToNext(live.bondPoints) : serverProgress;

  const atTopTier = tierIndex >= TOP_TIER_INDEX;
  const nextTierName = atTopTier ? null : TIERS[tierIndex + 1].name;
  const nextTierAt = atTopTier ? null : TIERS[tierIndex + 1].at;
  const bpToNext = nextTierAt != null ? Math.max(0, Math.ceil(nextTierAt - bondPoints)) : 0;

  const rank = bond?.rank ?? null;
  const totalFans = bond?.totalFans ?? 0;
  const streakDays = bond?.streakDays ?? 0;
  const name = bond?.artistName ?? artistName ?? "this artist";

  return (
    <section
      className="lx-bond-card"
      data-tier={tierIndex}
      data-live={isLive ? "true" : undefined}
      aria-label={`Your Superfan Bond with ${name}`}
    >
      <div className="lx-bond-head">
        <span className="lx-bond-eyebrow">Your Bond</span>
        <span className="lx-bond-tier" data-tier={tierIndex}>
          {tier}
        </span>
      </div>

      <div className="lx-bond-points">
        <span className="lx-bond-points-num">{bondPoints.toLocaleString()}</span>
        <span className="lx-bond-points-lbl">bond points</span>
        {streakDays > 0 && (
          <span className="lx-bond-streak" title={`${streakDays}-day listening streak`}>
            🔥 {streakDays}-day streak
          </span>
        )}
      </div>

      {atTopTier ? (
        <div className="lx-bond-progress lx-bond-progress-max">
          <div className="lx-bond-bar" data-tier={tierIndex}>
            <span className="lx-bond-bar-fill" data-tier={tierIndex} style={{ width: "100%" }} />
          </div>
          <p className="lx-bond-next">Max tier — you&apos;re a {tier}. ✨</p>
        </div>
      ) : (
        <div className="lx-bond-progress">
          <div className="lx-bond-bar" data-tier={tierIndex}>
            <span
              className="lx-bond-bar-fill"
              data-tier={tierIndex}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="lx-bond-next">
            <strong>{bpToNext.toLocaleString()} BP</strong> to {nextTierName}
          </p>
        </div>
      )}

      {rank != null ? (
        <p className="lx-bond-rank">
          You&apos;re <strong>#{rank.toLocaleString()}</strong> of {totalFans.toLocaleString()}{" "}
          {totalFans === 1 ? "backer" : "backers"}
        </p>
      ) : (
        <p className="lx-bond-rank lx-bond-rank-empty">
          Start your bond — press play to become a backer.
        </p>
      )}
    </section>
  );
}

function BondCardSkeleton() {
  return (
    <section className="lx-bond-card lx-bond-card-sk" aria-busy="true" aria-label="Loading your bond">
      <div className="lx-bond-head">
        <span className="lx-sk" style={{ width: 70, height: 12 }} />
        <span className="lx-sk" style={{ width: 64, height: 22, borderRadius: 999 }} />
      </div>
      <div className="lx-bond-points">
        <span className="lx-sk" style={{ width: 110, height: 30 }} />
      </div>
      <div className="lx-bond-progress">
        <span className="lx-sk" style={{ width: "100%", height: 10, borderRadius: 999 }} />
        <span className="lx-sk" style={{ width: 140, height: 12, marginTop: 8 }} />
      </div>
      <span className="lx-sk" style={{ width: 180, height: 12 }} />
    </section>
  );
}
