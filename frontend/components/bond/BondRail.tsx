"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import { slugify } from "@/lib/slug";
import * as api from "@/lib/api/client";
import type { BondSummary, MyBonds } from "@/lib/api/types";
import { nextTier, progressToNext } from "@/lib/bond/bondConfig";

/** A bond is "almost there" once it's at least this far toward the next tier —
 *  the point where a single listen closes the gap, so it's the strongest hook. */
const ALMOST_THRESHOLD = 0.6;
/** A rank worth defending: #1..#3 are the spots a returning fan can lose. */
const DEFEND_RANK = 3;
const MAX_CARDS = 6;

/** A single re-engagement prompt derived from one bond. Two flavors:
 *  - "almost": you're close to leveling up your tier with this artist.
 *  - "defend": you hold a top rank you could lose. */
type Prompt =
  | {
      kind: "almost";
      artistId: string;
      artistName: string;
      /** Tier index of the goal (the next tier) — drives the accent color. */
      tierIndex: number;
      goalTier: string;
      bpToGo: number;
      progress: number;
    }
  | {
      kind: "defend";
      artistId: string;
      artistName: string;
      tierIndex: number;
      rank: number;
    };

/** Turn the listener's bonds into a prioritized, deduped list of prompts.
 *  "Almost there" cards sort first (by how close to the next tier), then
 *  "defend your spot" cards (by rank). An artist appears at most once —
 *  the almost-there hook wins when a bond qualifies for both. */
function buildPrompts(bonds: BondSummary[]): Prompt[] {
  const almost: Extract<Prompt, { kind: "almost" }>[] = [];
  const defend: Extract<Prompt, { kind: "defend" }>[] = [];

  for (const b of bonds) {
    const next = nextTier(b.bondPoints);
    const progress = progressToNext(b.bondPoints);
    if (next && progress >= ALMOST_THRESHOLD) {
      almost.push({
        kind: "almost",
        artistId: b.artistId,
        artistName: b.artistName,
        tierIndex: b.tierIndex + 1,
        goalTier: next.name,
        bpToGo: Math.max(1, Math.ceil(next.at - b.bondPoints)),
        progress,
      });
    }
    if (b.rank != null && b.rank <= DEFEND_RANK) {
      defend.push({
        kind: "defend",
        artistId: b.artistId,
        artistName: b.artistName,
        tierIndex: b.tierIndex,
        rank: b.rank,
      });
    }
  }

  almost.sort((a, b) => b.progress - a.progress);
  defend.sort((a, b) => a.rank - b.rank);

  const seen = new Set<string>();
  const out: Prompt[] = [];
  for (const p of [...almost, ...defend]) {
    if (seen.has(p.artistId)) continue;
    seen.add(p.artistId);
    out.push(p);
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

function artistHref(p: Prompt): string {
  return ROUTES.artistProfile(slugify(p.artistName) || p.artistId);
}

/** A horizontal rail of Superfan Bond re-engagement nudges, shown atop /browse
 *  so a returning fan sees their progress (and what they could lose) first.
 *
 *  Loss-aversion by design: an account-wide streak flame, "X BP to <tier>"
 *  almost-there hooks, and "defend your #N spot" prompts. Renders nothing for
 *  signed-out users (getMyBonds 401s) or anyone without a bond yet, so it never
 *  clutters an empty browse. */
export default function BondRail() {
  // null = still loading; a value (possibly with no usable prompts) = loaded.
  const [data, setData] = useState<MyBonds | null>(null);
  // Distinguish "loaded but nothing to show / not signed in" from "loading".
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () => {
      api
        .getMyBonds()
        .then((d) => {
          if (!live) return;
          setData(d);
          setReady(true);
        })
        // Anon/401 or any failure: show nothing, never break browse.
        .catch(() => {
          if (!live) return;
          setData(null);
          setReady(true);
        });
    };
    load();
    const onSignedIn = () => load();
    const onSignedOut = () => {
      setData(null);
      setReady(true);
    };
    window.addEventListener("tollroad:signedin", onSignedIn);
    window.addEventListener("tollroad:signedout", onSignedOut);
    return () => {
      live = false;
      window.removeEventListener("tollroad:signedin", onSignedIn);
      window.removeEventListener("tollroad:signedout", onSignedOut);
    };
  }, []);

  // Stay invisible until we know there's something to show — no skeleton, so a
  // signed-out browse looks untouched.
  if (!ready || !data) return null;

  const streak = data.streakDays > 0 ? data.streakDays : 0;
  const prompts = buildPrompts(data.bonds);

  // Nothing to nudge: no streak and no qualifying bond → render nothing.
  if (streak === 0 && prompts.length === 0) return null;

  return (
    <section className="lx-bond-rail" aria-label="Your bonds">
      <div className="lx-bond-rail-head">
        <h2 className="lx-section-h">Your bonds</h2>
        {streak > 0 && (
          <span className="lx-bond-streak" title={`${streak}-day listening streak`}>
            <span className="lx-bond-flame" aria-hidden="true">🔥</span>
            <span className="lx-bond-streak-n">{streak}-day streak</span>
            <span className="lx-bond-streak-cta">— listen today to keep it</span>
          </span>
        )}
      </div>

      {prompts.length > 0 && (
        <div className="lx-bond-rail-track">
          {prompts.map((p) => (
            <Link
              key={`${p.kind}:${p.artistId}`}
              href={artistHref(p)}
              className="lx-bond-rail-card"
              data-kind={p.kind}
              data-tier={p.tierIndex}
              title={
                p.kind === "almost"
                  ? `${p.bpToGo} BP to ${p.goalTier} with ${p.artistName}`
                  : `You're #${p.rank} backer of ${p.artistName}`
              }
            >
              {p.kind === "almost" ? (
                <>
                  <span className="lx-bond-card-eyebrow">Almost {p.goalTier}</span>
                  <span className="lx-bond-card-line">
                    <strong className="lx-bond-card-bp">{p.bpToGo} BP</strong> to{" "}
                    <span className="lx-bond-card-goal">{p.goalTier}</span>
                  </span>
                  <span className="lx-bond-card-artist">with {p.artistName}</span>
                  <span
                    className="lx-bond-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(p.progress * 100)}
                  >
                    <span
                      className="lx-bond-progress-fill"
                      style={{ width: `${Math.round(p.progress * 100)}%` }}
                    />
                  </span>
                </>
              ) : (
                <>
                  <span className="lx-bond-card-eyebrow">
                    {p.rank === 1 ? "Defend #1" : `Defend #${p.rank}`}
                  </span>
                  <span className="lx-bond-card-line">
                    {p.rank === 1 ? (
                      <>
                        You&apos;re the <strong className="lx-bond-card-bp">#1</strong> backer
                      </>
                    ) : (
                      <>
                        You&apos;re <strong className="lx-bond-card-bp">#{p.rank}</strong> backer
                      </>
                    )}
                  </span>
                  <span className="lx-bond-card-artist">of {p.artistName}</span>
                  <span className="lx-bond-card-foot">
                    {p.rank === 1 ? "Keep your spot" : "Climb the leaderboard"}
                  </span>
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
