"use client";

// The public fan profile — a "wall of bonds". Fetches a fan's bonds by handle
// (getProfileBonds) and renders them as a collectible trophy shelf: one tile per
// backed artist, sorted by bond points, each wearing its tier as a cool→hot
// colored badge. This is the shareable identity surface, so it owns the full
// lifecycle: a loading skeleton, a friendly "no such fan" state for an unknown
// /unclaimed handle (ApiError 404), and an inviting empty state for a claimed
// profile that hasn't backed anyone yet.

import { useEffect, useState } from "react";
import * as api from "@/lib/api/client";
import type { BondSummary, ProfileBonds } from "@/lib/api/types";
import ArtistLink from "@/components/listen/ArtistLink";

type Status = "loading" | "missing" | "ready";

export default function BondWall({ handle }: { handle: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<ProfileBonds | null>(null);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    api
      .getProfileBonds(handle)
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setStatus("ready");
      })
      .catch(() => {
        // getProfileBonds throws ApiError 404 for an unknown/unclaimed handle —
        // the expected case. Any other failure (signed-out, unconfigured) also
        // degrades to the friendly "missing" state rather than crashing.
        if (alive) setStatus("missing");
      });
    return () => {
      alive = false;
    };
  }, [handle]);

  if (status === "loading") return <BondWallSkeleton />;
  if (status === "missing" || !profile) return <NoSuchFan handle={handle} />;

  // Sort a defensive copy so the shelf always reads strongest-bond-first.
  const bonds = [...profile.bonds].sort((a, b) => b.bondPoints - a.bondPoints);
  const displayName = profile.displayName || `@${profile.handle}`;
  const backed = bonds.length;

  return (
    <section className="lx-bond-wall" aria-label={`${displayName}'s bonds`}>
      <header className="lx-bond-wall-head">
        <span className="lx-bond-wall-eyebrow">Superfan profile</span>
        <h1 className="lx-bond-wall-name">{displayName}</h1>
        <p className="lx-bond-wall-handle">@{profile.handle}</p>
        <dl className="lx-bond-wall-stats">
          <div className="lx-bond-wall-stat">
            <dt>Bond points</dt>
            <dd>{profile.totalBondPoints.toLocaleString()}</dd>
          </div>
          <div className="lx-bond-wall-stat">
            <dt>Artists backed</dt>
            <dd>{backed.toLocaleString()}</dd>
          </div>
        </dl>
      </header>

      {backed === 0 ? (
        <div className="lx-bond-wall-empty">
          <span className="lx-bond-wall-empty-mark" aria-hidden="true">
            ✦
          </span>
          <p className="lx-bond-wall-empty-title">No bonds yet</p>
          <p className="lx-bond-wall-empty-sub">Start backing artists — every minute you listen builds a bond.</p>
        </div>
      ) : (
        <ul className="lx-bond-grid" role="list">
          {bonds.map((b) => (
            <BondTile key={b.artistId} bond={b} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One collectible tile: artist name, tier badge (cool→hot), bond points, rank. */
function BondTile({ bond }: { bond: BondSummary }) {
  return (
    <li className="lx-bond-tile" data-tier={bond.tierIndex}>
      <div className="lx-bond-tile-top">
        <span className="lx-bond-tile-tier" data-tier={bond.tierIndex}>
          {bond.tier}
        </span>
      </div>
      <h2 className="lx-bond-tile-artist">
        <ArtistLink id={bond.artistId} name={bond.artistName} className="lx-bond-tile-artist-link" />
      </h2>
      <div className="lx-bond-tile-bp">
        <span className="lx-bond-tile-bp-num">{bond.bondPoints.toLocaleString()}</span>
        <span className="lx-bond-tile-bp-lbl">bond points</span>
      </div>
      {bond.rank != null && (
        <p className="lx-bond-tile-rank">
          <strong>#{bond.rank.toLocaleString()}</strong> of {bond.totalFans.toLocaleString()}
        </p>
      )}
    </li>
  );
}

function NoSuchFan({ handle }: { handle: string }) {
  return (
    <section className="lx-bond-wall lx-bond-wall-missing" aria-label="Fan not found">
      <span className="lx-bond-wall-empty-mark" aria-hidden="true">
        ✦
      </span>
      <p className="lx-bond-wall-empty-title">No such fan</p>
      <p className="lx-bond-wall-empty-sub">
        We couldn&apos;t find a superfan at <code>@{handle}</code>. The handle may be unclaimed or mistyped.
      </p>
    </section>
  );
}

function BondWallSkeleton() {
  return (
    <section className="lx-bond-wall" aria-busy="true" aria-label="Loading profile">
      <header className="lx-bond-wall-head">
        <span className="lx-sk" style={{ width: 120, height: 12 }} />
        <span className="lx-sk" style={{ width: 220, height: 34, marginTop: 10 }} />
        <span className="lx-sk" style={{ width: 110, height: 14, marginTop: 8 }} />
        <div className="lx-bond-wall-stats" style={{ marginTop: 18 }}>
          <span className="lx-sk" style={{ width: 120, height: 40 }} />
          <span className="lx-sk" style={{ width: 120, height: 40 }} />
        </div>
      </header>
      <ul className="lx-bond-grid" role="list">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="lx-bond-tile lx-bond-tile-sk">
            <span className="lx-sk" style={{ width: 64, height: 22, borderRadius: 999 }} />
            <span className="lx-sk" style={{ width: "70%", height: 18, marginTop: 16 }} />
            <span className="lx-sk" style={{ width: "50%", height: 26, marginTop: 14 }} />
            <span className="lx-sk" style={{ width: "40%", height: 12, marginTop: 12 }} />
          </li>
        ))}
      </ul>
    </section>
  );
}
