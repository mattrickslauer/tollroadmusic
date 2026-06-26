// Canonical Superfan Bond math — pure, deterministic, no DB and no Date.now.
// The front-end mirrors these EXACT constants and functions, so any change here
// must be reflected there (and vice versa). Keep this file dependency-free.

/** Bond points earned per metered minute listened. */
export const BP_PER_MINUTE = 1;

/** Bond tiers, ascending by the bond-point threshold (`at`) needed to reach them. */
export const TIERS = [
  { name: "Listener", at: 0 },
  { name: "Regular", at: 30 },
  { name: "Fan", at: 120 },
  { name: "Superfan", at: 480 },
  { name: "Devotee", at: 1500 },
] as const;

/** Bond points from minutes listened: minutes * BP_PER_MINUTE, floored, never < 0. */
export function bondPointsFromMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.floor(minutes * BP_PER_MINUTE);
}

/** The highest tier whose `at` threshold is <= bp, with its index in TIERS. */
export function resolveTier(bp: number): { name: string; index: number } {
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i]!;
    if (bp >= t.at) index = i;
    else break;
  }
  return { name: TIERS[index]!.name, index };
}

/** The next tier above the current bond points, or null if already at the top. */
export function nextTier(bp: number): { name: string; at: number } | null {
  const { index } = resolveTier(bp);
  const next = TIERS[index + 1];
  return next ? { name: next.name, at: next.at } : null;
}

/** Progress (0..1) from the current tier's threshold toward the next tier's.
 *  Returns 1 when already at the top tier. */
export function progressToNext(bp: number): number {
  const { index } = resolveTier(bp);
  const current = TIERS[index]!;
  const next = TIERS[index + 1];
  if (!next) return 1;
  const span = next.at - current.at;
  if (span <= 0) return 1;
  const ratio = (bp - current.at) / span;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

/** Consecutive-day streak ending at (or one day before) `todayDay`.
 *  `distinctDays` is the sorted-desc list of distinct day indices the user
 *  listened. The streak starts only if the user listened today OR yesterday;
 *  it then counts back while each preceding day index is present. */
export function streakDays(distinctDays: number[], todayDay: number): number {
  if (distinctDays.length === 0) return 0;
  const present = new Set(distinctDays);
  // Anchor: today if present, else yesterday if present, else no streak.
  let cursor: number;
  if (present.has(todayDay)) cursor = todayDay;
  else if (present.has(todayDay - 1)) cursor = todayDay - 1;
  else return 0;
  let count = 0;
  while (present.has(cursor)) {
    count++;
    cursor--;
  }
  return count;
}
