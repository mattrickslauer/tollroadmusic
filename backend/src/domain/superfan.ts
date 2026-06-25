// Superfan Bond aggregation queries. The bond between a listener and an artist
// is derived entirely from the append-only royalty_ledger (one row per metered
// minute): minutes = COUNT(*), spend = SUM(amount_cents). Tier/BP math is the
// canonical, DB-free logic in bondMath.ts; this layer only supplies the numbers
// (and "today" for the streak).
import { query } from "../lib/dsql.ts";
import {
  bondPointsFromMinutes,
  resolveTier,
  nextTier,
  progressToNext,
  streakDays,
} from "./bondMath.ts";

/** UTC day index of "now" — same scale as floor(minute_epoch/1440). */
function todayDayIndex(): number {
  return Math.floor(Date.now() / 86400000);
}

/** The distinct UTC day indices this account listened on (any artist). */
async function distinctListenDays(userId: string): Promise<number[]> {
  const res = await query<{ day: string }>(
    `SELECT DISTINCT floor(minute_epoch / 1440) AS day
       FROM royalty_ledger
      WHERE user_id = $1`,
    [userId],
  );
  return res.rows.map((r) => Number(r.day));
}

/** Account-wide listening streak (consecutive days ending today/yesterday). */
async function accountStreak(userId: string): Promise<number> {
  const days = await distinctListenDays(userId);
  return streakDays(days, todayDayIndex());
}

export interface Bond {
  artistId: string;
  artistName: string;
  bondPoints: number;
  minutes: number;
  amountCents: number;
  tier: string;
  tierIndex: number;
  nextTier: string | null;
  nextTierAt: number | null;
  progressToNext: number;
  rank: number | null;
  totalFans: number;
  streakDays: number;
}

/** The listener's full bond with one artist. Returns a zero bond (rank null)
 *  when the artist exists but the listener has no history. */
export async function getBond(userId: string, artistId: string): Promise<Bond | null> {
  const artistRes = await query<{ name: string | null }>(
    `SELECT name FROM artists WHERE id = $1`,
    [artistId],
  );
  if (artistRes.rowCount === 0) return null;
  const artistName = artistRes.rows[0]?.name ?? "Unknown artist";

  const totalsRes = await query<{ minutes: string; amount_cents: string | null }>(
    `SELECT COUNT(*) AS minutes, SUM(amount_cents) AS amount_cents
       FROM royalty_ledger
      WHERE user_id = $1 AND artist_id = $2`,
    [userId, artistId],
  );
  const minutes = Number(totalsRes.rows[0]?.minutes ?? 0);
  const amountCents = Number(totalsRes.rows[0]?.amount_cents ?? 0);
  const bondPoints = bondPointsFromMinutes(minutes);

  // Distinct claimed fans of this artist (the leaderboard population).
  const fansRes = await query<{ total_fans: string }>(
    `SELECT COUNT(DISTINCT l.user_id) AS total_fans
       FROM royalty_ledger l
       JOIN accounts a ON a.user_id = l.user_id
      WHERE l.artist_id = $1
        AND a.claimed_at IS NOT NULL
        AND a.handle IS NOT NULL`,
    [artistId],
  );
  const totalFans = Number(fansRes.rows[0]?.total_fans ?? 0);

  // 1-based rank among ALL fans of the artist by minutes desc. Only meaningful
  // when the listener has history.
  let rank: number | null = null;
  if (minutes > 0) {
    const rankRes = await query<{ rank: string }>(
      `WITH per_fan AS (
         SELECT user_id, COUNT(*) AS minutes
           FROM royalty_ledger
          WHERE artist_id = $1
          GROUP BY user_id
       )
       SELECT COUNT(*) + 1 AS rank
         FROM per_fan
        WHERE minutes > (SELECT minutes FROM per_fan WHERE user_id = $2)`,
      [artistId, userId],
    );
    rank = Number(rankRes.rows[0]?.rank ?? 0) || null;
  }

  const tier = resolveTier(bondPoints);
  const next = nextTier(bondPoints);

  return {
    artistId,
    artistName,
    bondPoints,
    minutes,
    amountCents,
    tier: tier.name,
    tierIndex: tier.index,
    nextTier: next ? next.name : null,
    nextTierAt: next ? next.at : null,
    progressToNext: progressToNext(bondPoints),
    rank,
    totalFans,
    streakDays: await accountStreak(userId),
  };
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  displayName: string;
  bondPoints: number;
  tier: string;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  totalFans: number;
}

/** Top `limit` claimed fans of an artist, ranked by minutes desc. */
export async function getLeaderboard(artistId: string, limit = 50): Promise<Leaderboard> {
  const res = await query<{
    handle: string;
    display_name: string | null;
    minutes: string;
  }>(
    `SELECT a.handle AS handle,
            a.display_name AS display_name,
            COUNT(*) AS minutes
       FROM royalty_ledger l
       JOIN accounts a ON a.user_id = l.user_id
      WHERE l.artist_id = $1
        AND a.claimed_at IS NOT NULL
        AND a.handle IS NOT NULL
      GROUP BY a.handle, a.display_name
      ORDER BY minutes DESC, a.handle ASC
      LIMIT $2`,
    [artistId, limit],
  );

  const entries: LeaderboardEntry[] = res.rows.map((r, i) => {
    const bp = bondPointsFromMinutes(Number(r.minutes));
    return {
      rank: i + 1,
      handle: r.handle,
      displayName: r.display_name ?? r.handle,
      bondPoints: bp,
      tier: resolveTier(bp).name,
    };
  });

  // Distinct claimed fans of this artist (full population, not just the page).
  const totalRes = await query<{ total_fans: string }>(
    `SELECT COUNT(DISTINCT l.user_id) AS total_fans
       FROM royalty_ledger l
       JOIN accounts a ON a.user_id = l.user_id
      WHERE l.artist_id = $1
        AND a.claimed_at IS NOT NULL
        AND a.handle IS NOT NULL`,
    [artistId],
  );

  return { entries, totalFans: Number(totalRes.rows[0]?.total_fans ?? 0) };
}

export interface BondSummary {
  artistId: string;
  artistName: string;
  bondPoints: number;
  minutes: number;
  tier: string;
  tierIndex: number;
  rank: null;
  totalFans: number;
}

/** Per-artist bond summaries for one account, sorted by bond points desc.
 *  Rank/totalFans are intentionally omitted (0/null) here for performance. */
async function bondSummariesForUser(userId: string): Promise<BondSummary[]> {
  const res = await query<{
    artist_id: string;
    artist_name: string | null;
    minutes: string;
  }>(
    `SELECT l.artist_id AS artist_id,
            a.name AS artist_name,
            COUNT(*) AS minutes
       FROM royalty_ledger l
       LEFT JOIN artists a ON a.id = l.artist_id
      WHERE l.user_id = $1
      GROUP BY l.artist_id, a.name
      ORDER BY minutes DESC`,
    [userId],
  );
  return res.rows.map((r) => {
    const minutes = Number(r.minutes);
    const bondPoints = bondPointsFromMinutes(minutes);
    const tier = resolveTier(bondPoints);
    return {
      artistId: r.artist_id,
      artistName: r.artist_name ?? "Unknown artist",
      bondPoints,
      minutes,
      tier: tier.name,
      tierIndex: tier.index,
      rank: null as null,
      totalFans: 0,
    };
  });
}

export interface MyBonds {
  bonds: BondSummary[];
  streakDays: number;
  totalBondPoints: number;
}

/** All of the signed-in listener's bonds, plus account-wide streak + total BP. */
export async function getMyBonds(userId: string): Promise<MyBonds> {
  const [bonds, streak] = await Promise.all([
    bondSummariesForUser(userId),
    accountStreak(userId),
  ]);
  // bondSummariesForUser already sorts by bond points desc (minutes desc).
  const totalBondPoints = bonds.reduce((sum, b) => sum + b.bondPoints, 0);
  return { bonds, streakDays: streak, totalBondPoints };
}

export interface ProfileBonds {
  handle: string;
  displayName: string;
  bonds: BondSummary[];
  totalBondPoints: number;
}

/** Public profile bonds, resolved by handle (claimed accounts only). Returns
 *  null when no such claimed handle exists. */
export async function getProfileBonds(handle: string): Promise<ProfileBonds | null> {
  const acct = await query<{ user_id: string; handle: string; display_name: string | null }>(
    `SELECT user_id, handle, display_name
       FROM accounts
      WHERE handle = $1 AND claimed_at IS NOT NULL`,
    [handle],
  );
  const row = acct.rows[0];
  if (!row) return null;

  const bonds = await bondSummariesForUser(row.user_id);
  const totalBondPoints = bonds.reduce((sum, b) => sum + b.bondPoints, 0);
  return {
    handle: row.handle,
    displayName: row.display_name ?? row.handle,
    bonds,
    totalBondPoints,
  };
}
