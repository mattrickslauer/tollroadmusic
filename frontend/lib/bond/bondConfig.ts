// Client mirror of the Superfan Bond math. The backend is the source of truth
// for a listener's bond, but the player accrues minutes locally for optimistic
// UI (the live meter + tier-up celebration), so the tier thresholds and the
// per-minute rate are duplicated here. These MUST stay identical to the backend
// (BP_PER_MINUTE + the TIERS table) or the optimistic UI will disagree with the
// reconciled server value.

export const BP_PER_MINUTE = 1;

export const TIERS = [
  { name: "Listener", at: 0 },
  { name: "Regular", at: 30 },
  { name: "Fan", at: 120 },
  { name: "Superfan", at: 480 },
  { name: "Devotee", at: 1500 },
] as const;

/** The tier a given bond-point total currently sits in (highest threshold met). */
export function resolveTier(bp: number): { name: string; index: number } {
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (bp >= TIERS[i].at) index = i;
    else break;
  }
  return { name: TIERS[index].name, index };
}

/** The next tier above the current one, or null at the top tier. */
export function nextTier(bp: number): { name: string; at: number } | null {
  const { index } = resolveTier(bp);
  const next = TIERS[index + 1];
  return next ? { name: next.name, at: next.at } : null;
}

/** Fractional progress (0..1) from the current tier's threshold toward the next.
 *  Returns 1 at the top tier (nothing left to progress toward). */
export function progressToNext(bp: number): number {
  const { index } = resolveTier(bp);
  const cur = TIERS[index];
  const next = TIERS[index + 1];
  if (!next) return 1;
  const span = next.at - cur.at;
  if (span <= 0) return 1;
  const p = (bp - cur.at) / span;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
