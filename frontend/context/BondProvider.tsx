"use client";

// The live-bond context. Sits INSIDE PlayerProvider (so it can read the
// currently-playing track + the metered seconds) and turns real playback into an
// optimistic Superfan Bond:
//
//   • when the playing artist changes we reconcile() — fetch the authoritative
//     bond from the server and set that as the live baseline.
//   • every whole metered minute the player crosses for the current artist adds
//     BP_PER_MINUTE optimistically; tier/progress are recomputed via bondConfig.
//   • crossing into a higher tier emits a tier-up event to subscribers (the
//     player celebration listens for this). Tier-ups are idempotent per
//     (artistId, tierName) for the life of the session, so a tier never
//     double-fires (e.g. on reconcile, or re-listening within the same session).
//
// The server is the source of truth; everything here is optimistic and is
// re-anchored by the next reconcile(). The provider NEVER throws — a failed
// reconcile (signed-out, unconfigured backend, 401) degrades to an empty bond.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "@/lib/api/client";
import { usePlayer } from "@/context/PlayerProvider";
import { BP_PER_MINUTE, progressToNext, resolveTier } from "@/lib/bond/bondConfig";

export interface LiveBond {
  artistId: string | null;
  artistName: string | null;
  bondPoints: number;
  tier: string;
  tierIndex: number;
  progressToNext: number;
}

export interface TierUpEvent {
  artistId: string;
  artistName: string | null;
  tier: string;
  tierIndex: number;
}

type TierUpCb = (e: TierUpEvent) => void;

interface BondContextValue {
  live: LiveBond;
  reconcile: (artistId: string) => Promise<void>;
  subscribeTierUp: (cb: TierUpCb) => () => void;
}

/** Build a LiveBond from a raw bond-point total (single source of derived fields). */
function liveFrom(artistId: string | null, artistName: string | null, bondPoints: number): LiveBond {
  const t = resolveTier(bondPoints);
  return { artistId, artistName, bondPoints, tier: t.name, tierIndex: t.index, progressToNext: progressToNext(bondPoints) };
}

const EMPTY_LIVE: LiveBond = liveFrom(null, null, 0);

const Ctx = createContext<BondContextValue | null>(null);

export function useBond(): BondContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBond must be used within <BondProvider>");
  return ctx;
}

export function BondProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { current, billedSec } = usePlayer();
  const artistId = current?.artistId ?? null;
  const artistName = current?.artistName ?? null;

  const [live, setLive] = useState<LiveBond>(EMPTY_LIVE);
  // A render-synced mirror of `live` so effects read the latest baseline without
  // taking `live` as a dependency (which would re-run the minute loop on every BP tick).
  const liveRef = useRef(live);
  liveRef.current = live;

  // Tier-up subscribers + the idempotency set ("artistId::tierName" already fired).
  const subsRef = useRef<Set<TierUpCb>>(new Set());
  const firedTiersRef = useRef<Set<string>>(new Set());
  // The highest whole-minute count we've already credited for the current
  // artist session; advanced as the player crosses minute boundaries.
  const lastMinuteRef = useRef(0);

  const subscribeTierUp = useCallback((cb: TierUpCb) => {
    subsRef.current.add(cb);
    return () => {
      subsRef.current.delete(cb);
    };
  }, []);

  const emitTierUp = useCallback((e: TierUpEvent) => {
    subsRef.current.forEach((cb) => {
      try {
        cb(e);
      } catch {
        /* a misbehaving subscriber must never break the meter */
      }
    });
  }, []);

  const reconcile = useCallback(async (id: string) => {
    try {
      const b = await api.getBond(id);
      // Derive tier/progress via bondConfig (not the server's fields) so the
      // baseline and subsequent optimistic ticks use one consistent math.
      const next = liveFrom(b.artistId, b.artistName, b.bondPoints);
      setLive(next);
      // The artist's current tier is already "earned" — never celebrate it.
      firedTiersRef.current.add(`${b.artistId}::${next.tier}`);
    } catch {
      // Signed-out / unconfigured / 401 → degrade to an empty bond for this artist.
      setLive(liveFrom(id, null, 0));
    }
  }, []);

  // Artist changed → re-anchor the minute counter and fetch the authoritative bond.
  useEffect(() => {
    lastMinuteRef.current = Math.floor(billedSec / 60);
    if (artistId) reconcile(artistId);
    else setLive(EMPTY_LIVE);
    // billedSec intentionally excluded: we only re-anchor when the artist flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId, reconcile]);

  // Whole-minute crossings for the current artist → optimistic BP + tier-up.
  useEffect(() => {
    if (!artistId) return;
    const minutes = Math.floor(billedSec / 60);

    // billedSec resets to 0 when a new track starts (even same artist). If it went
    // backwards, the meter restarted — re-anchor without crediting anything.
    if (minutes < lastMinuteRef.current) {
      lastMinuteRef.current = minutes;
      return;
    }
    if (minutes <= lastMinuteRef.current) return;

    // Don't credit until reconcile() has landed for THIS artist, otherwise we'd
    // add minutes onto a stale baseline. Re-anchor and wait for the next minute.
    if (liveRef.current.artistId !== artistId) {
      lastMinuteRef.current = minutes;
      return;
    }

    const crossed = minutes - lastMinuteRef.current;
    lastMinuteRef.current = minutes;

    const prevIndex = liveRef.current.tierIndex;
    const newBp = liveRef.current.bondPoints + crossed * BP_PER_MINUTE;
    const next = liveFrom(artistId, artistName, newBp);
    setLive(next);

    if (next.tierIndex > prevIndex) {
      const key = `${artistId}::${next.tier}`;
      if (!firedTiersRef.current.has(key)) {
        firedTiersRef.current.add(key);
        emitTierUp({ artistId, artistName, tier: next.tier, tierIndex: next.tierIndex });
      }
    }
  }, [billedSec, artistId, artistName, emitTierUp]);

  const value = useMemo<BondContextValue>(() => ({ live, reconcile, subscribeTierUp }), [live, reconcile, subscribeTierUp]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
