"use client";

// Compact live Superfan-Bond meter for the player dock. Reads the optimistic
// live bond (which re-renders as BP accrues each metered minute) and shows the
// fan their current tier + a thin progress bar ticking toward the next one, so
// they watch the bond grow while they listen. Renders nothing when there's no
// playing artist to bond with.

import { useBond } from "@/context/BondProvider";
import { nextTier } from "@/lib/bond/bondConfig";

export default function BondMeter() {
  const { live } = useBond();

  // Nothing playing / no artist resolved yet → keep the dock clean.
  if (!live.artistId) return null;

  const upcoming = nextTier(live.bondPoints);
  const pct = Math.round(live.progressToNext * 100);
  const maxed = !upcoming; // top tier — bar reads full, no "next" target.

  return (
    <div
      className="lx-bond-meter"
      data-tier={live.tier}
      data-maxed={maxed}
      title={
        upcoming
          ? `${live.bondPoints} bond points · ${upcoming.at - live.bondPoints} to ${upcoming.name}`
          : `${live.bondPoints} bond points · top tier`
      }
      aria-label={`Bond with ${live.artistName ?? "this artist"}: ${live.tier}, ${live.bondPoints} bond points${upcoming ? `, ${pct}% to ${upcoming.name}` : ", top tier"}`}
    >
      <span className="lx-bond-badge">{live.tier}</span>
      <span className="lx-bond-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="lx-bond-fill" style={{ width: `${maxed ? 100 : pct}%` }} />
      </span>
      <span className="lx-bond-bp">
        {live.bondPoints}
        <small>BP</small>
      </span>
    </div>
  );
}
