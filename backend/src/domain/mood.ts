// Vibe Pad — the mood-pad mini-game core: durable trace storage + IN-SQL crowd
// consensus/agreement (Aurora DSQL) + a consensus-weighted free-listening reward
// credited through the EXISTING DynamoDB wallet path. See
// docs/superpowers/specs/2026-06-28-mood-pad-game-design.md (§4–§7).
//
// STORAGE NOTE (DSQL): Aurora DSQL does NOT support array column types (`real[]`
// et al. fail 0A000), so the grid-aligned v/e samples live in `jsonb` columns.
// `jsonb_array_elements(col) WITH ORDINALITY AS a(elem, ord)` reproduces the
// spec's `generate_subscripts`/`t.v[idx]` access; a released-puck GAP is a JSON
// `null` element, turned into SQL NULL via `NULLIF(elem,'null'::jsonb)::text::real`
// and dropped by `avg(...) FILTER (WHERE ... IS NOT NULL)`.
import { randomUUID } from "node:crypto";
import { query } from "../lib/dsql.ts";
import { creditTopup, getBalanceMillicents } from "./billing.ts";
import { walletStoreConfigured, getRealtimeBalance } from "./wallet-store.ts";

// ---- Reward / scoring constants (tune later; see spec §5) -------------------
export const GRID_MS = 250;
export const BASE_MINUTES = 1.0;
export const GAMMA = 1.5;
export const BOOTSTRAP_N = 5;
export const BOOTSTRAP_FACTOR = 0.5;
export const DAILY_REWARDED_CAP = 20;
export const MIN_COVERAGE = 0.5;

// ---- Public types (the frontend is built to this contract — match exactly) --
export interface MoodTraceResult {
  traceId: string;
  coveragePct: number;
  agreement: number | null;
  bootstrap: boolean;
  rewardMillicents: number;
  rewardMinutes: number;
  newBalanceMillicents: number;
  alreadyRewarded: boolean;
}

export interface MoodTags {
  dominantQuadrant: string;
  arcLabel: string;
  valenceMean: number;
  energyMean: number;
  confidence: number;
  source: string;
}

export interface MoodConsensusResult {
  songId: string;
  gridMs: number;
  traceCount: number;
  consensus: { v: (number | null)[]; e: (number | null)[] };
  tags: MoodTags | null;
}

export interface SubmitTraceInput {
  userId: string;
  songId: string;
  gridMs: number;
  durationMs: number;
  /** Grid-aligned samples; null where the puck was released (a gap). */
  v: (number | null)[];
  e: (number | null)[];
  /** The track's own per-minute price — the reward is denominated in it (earning
   *  a minute back == what a minute costs). Looked up by the handler. */
  pricePerMinuteMillicents: number;
}

// ---- Consensus rollup: average each grid bin across every trace for the song.
// Gaps (JSON null) are skipped per-bin so alignment is preserved; jsonb_agg keeps
// NULL bins as JSON null so v/e stay index-aligned to the 250ms grid. ----------
const CONSENSUS_SQL = `
WITH samp AS (
  SELECT a.ord AS bin,
         NULLIF(a.elem, 'null'::jsonb)::text::real            AS v,
         NULLIF(t.e -> (a.ord::int - 1), 'null'::jsonb)::text::real AS e
  FROM mood_traces t,
       LATERAL jsonb_array_elements(t.v) WITH ORDINALITY AS a(elem, ord)
  WHERE t.song_id = $1
),
agg AS (
  SELECT bin,
         avg(v) FILTER (WHERE v IS NOT NULL) AS cv,
         avg(e) FILTER (WHERE e IS NOT NULL) AS ce
  FROM samp
  GROUP BY bin
)
SELECT jsonb_agg(cv ORDER BY bin) AS v,
       jsonb_agg(ce ORDER BY bin) AS e
FROM agg`;

// ---- Agreement: 1 − mean euclidean distance / √8 (the diagonal of [-1,1]²),
// over only the bins where the submitter had signal AND the crowd has a value. --
const AGREEMENT_SQL = `
WITH me AS (
  SELECT a.ord AS bin,
         NULLIF(a.elem, 'null'::jsonb)::text::real            AS mv,
         NULLIF(t.e -> (a.ord::int - 1), 'null'::jsonb)::text::real AS me
  FROM mood_traces t,
       LATERAL jsonb_array_elements(t.v) WITH ORDINALITY AS a(elem, ord)
  WHERE t.user_id = $1 AND t.song_id = $2
),
c AS (
  SELECT a.ord AS bin,
         NULLIF(a.elem, 'null'::jsonb)::text::real             AS cv,
         NULLIF(sc.e -> (a.ord::int - 1), 'null'::jsonb)::text::real AS ce
  FROM song_consensus sc,
       LATERAL jsonb_array_elements(sc.v) WITH ORDINALITY AS a(elem, ord)
  WHERE sc.song_id = $2
)
SELECT 1 - avg( sqrt( power(me.mv - c.cv, 2) + power(me.me - c.ce, 2) ) / sqrt(8.0) ) AS agreement
FROM me
JOIN c USING (bin)
WHERE me.mv IS NOT NULL AND c.cv IS NOT NULL`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

async function liveBalance(userId: string): Promise<number> {
  return walletStoreConfigured() ? getRealtimeBalance(userId) : getBalanceMillicents(userId);
}

/** Rebuild the crowd curve for a song and persist it to song_consensus. Returns
 *  the binned arrays (gaps as null) + the current trace count. */
async function recomputeConsensus(
  songId: string,
  gridMs: number,
): Promise<{ v: (number | null)[]; e: (number | null)[]; traceCount: number }> {
  const cons = await query<{ v: (number | null)[] | null; e: (number | null)[] | null }>(CONSENSUS_SQL, [songId]);
  const v = cons.rows[0]?.v ?? [];
  const e = cons.rows[0]?.e ?? [];
  const tc = await query<{ n: number }>(`SELECT count(*)::int AS n FROM mood_traces WHERE song_id = $1`, [songId]);
  const traceCount = Number(tc.rows[0]?.n ?? 0);

  await query(
    `INSERT INTO song_consensus (song_id, grid_ms, v, e, trace_count, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now())
     ON CONFLICT (song_id) DO UPDATE
       SET grid_ms = EXCLUDED.grid_ms, v = EXCLUDED.v, e = EXCLUDED.e,
           trace_count = EXCLUDED.trace_count, updated_at = now()`,
    [songId, gridMs, JSON.stringify(v), JSON.stringify(e), traceCount],
  );
  return { v, e, traceCount };
}

/** Rule-based mood tags (Phase C1) derived from the consensus curve. */
function deriveTags(v: (number | null)[], e: (number | null)[], traceCount: number): MoodTags | null {
  const vs = v.filter((x): x is number => x != null);
  const es = e.filter((x): x is number => x != null);
  if (!vs.length || !es.length) return null;
  const vm = mean(vs);
  const em = mean(es);
  const dominantQuadrant = vm >= 0 ? (em >= 0 ? "hype" : "chill") : em >= 0 ? "tense" : "sad";
  return {
    dominantQuadrant,
    arcLabel: energyArc(e),
    valenceMean: vm,
    energyMean: em,
    confidence: Math.min(1, traceCount / 10),
    source: "human",
  };
}

/** Short trajectory label from the energy curve's first vs last third. */
function energyArc(e: (number | null)[]): string {
  const pts = e.filter((x): x is number => x != null);
  if (pts.length < 2) return "steady energy";
  const third = Math.max(1, Math.floor(pts.length / 3));
  const delta = mean(pts.slice(-third)) - mean(pts.slice(0, third));
  if (delta > 0.15) return "energy rising";
  if (delta < -0.15) return "energy falling";
  return "steady energy";
}

async function upsertTags(songId: string, tags: MoodTags | null): Promise<void> {
  if (!tags) return;
  await query(
    `INSERT INTO song_mood_tags
       (song_id, dominant_quadrant, arc_label, valence_mean, energy_mean, confidence, source, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (song_id) DO UPDATE
       SET dominant_quadrant = EXCLUDED.dominant_quadrant, arc_label = EXCLUDED.arc_label,
           valence_mean = EXCLUDED.valence_mean, energy_mean = EXCLUDED.energy_mean,
           confidence = EXCLUDED.confidence, source = EXCLUDED.source, updated_at = now()`,
    [songId, tags.dominantQuadrant, tags.arcLabel, tags.valenceMean, tags.energyMean, tags.confidence, tags.source],
  );
}

/** Submit a whole mood trace for one play of one song: UPSERT it, rebuild the
 *  crowd consensus + tags, score the submitter against the crowd, compute and
 *  (idempotently) credit the reward, and return the contract result. */
export async function submitTrace(input: SubmitTraceInput): Promise<MoodTraceResult> {
  const { userId, songId, gridMs, durationMs, v, e, pricePerMinuteMillicents: price } = input;

  const total = v.length;
  const signal = v.reduce<number>((n, x) => n + (x != null ? 1 : 0), 0);
  const coveragePct = total > 0 ? signal / total : 0;

  // Has this (user, song) already been PAID? One reward per pair — a re-reaction
  // updates the trace but never re-pays. (Detect before we overwrite the row.)
  const prior = await query<{ reward_millicents: string | null }>(
    `SELECT reward_millicents FROM mood_traces WHERE user_id = $1 AND song_id = $2`,
    [userId, songId],
  );
  const alreadyRewarded = Number(prior.rows[0]?.reward_millicents ?? 0) > 0;

  // UPSERT the trace data (reward/agreement filled in afterwards). A new row gets
  // a fresh trace_id; a re-reaction keeps the original trace_id (DO UPDATE).
  const up = await query<{ trace_id: string }>(
    `INSERT INTO mood_traces
       (trace_id, user_id, song_id, duration_ms, grid_ms, sample_count, coverage_pct, agreement, reward_millicents, v, e, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 0, $8::jsonb, $9::jsonb, now())
     ON CONFLICT (user_id, song_id) DO UPDATE
       SET duration_ms = EXCLUDED.duration_ms, grid_ms = EXCLUDED.grid_ms,
           sample_count = EXCLUDED.sample_count, coverage_pct = EXCLUDED.coverage_pct,
           v = EXCLUDED.v, e = EXCLUDED.e, created_at = now()
     RETURNING trace_id`,
    [randomUUID(), userId, songId, durationMs, gridMs, signal, coveragePct, JSON.stringify(v), JSON.stringify(e)],
  );
  const traceId = up.rows[0]!.trace_id;

  // Rebuild the crowd curve (now including this trace) + the rule-based tags.
  const consensus = await recomputeConsensus(songId, gridMs);
  await upsertTags(songId, deriveTags(consensus.v, consensus.e, consensus.traceCount));

  // Per-user daily rewarded cap (rolling 24h). The current trace is still at
  // reward 0, so it isn't counted here.
  const capRow = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM mood_traces
       WHERE user_id = $1 AND reward_millicents > 0 AND created_at >= now() - interval '24 hours'`,
    [userId],
  );
  const dailyCount = Number(capRow.rows[0]?.n ?? 0);

  // Eligibility gates (anti-abuse v1). TODO: also cross-check real listening via
  // the existing metering events (hasRecentMeter) — deferred.
  const eligible = coveragePct >= MIN_COVERAGE && !alreadyRewarded && dailyCount < DAILY_REWARDED_CAP;

  let agreement: number | null = null;
  let bootstrap = false;
  let reward = 0;

  if (consensus.traceCount < BOOTSTRAP_N) {
    // Too few traces for a trustworthy consensus — flat bootstrap pay, no score.
    bootstrap = true;
    agreement = null;
    if (eligible) reward = Math.round(price * BASE_MINUTES * BOOTSTRAP_FACTOR * coveragePct);
  } else {
    const ag = await query<{ agreement: number | null }>(AGREEMENT_SQL, [userId, songId]);
    const raw = ag.rows[0]?.agreement;
    agreement = raw == null ? null : clamp(Number(raw), 0, 1);
    if (eligible && agreement != null) {
      const weight = clamp(Math.pow(agreement, GAMMA), 0, 1);
      reward = Math.round(price * BASE_MINUTES * weight * coveragePct);
    }
  }

  // Persist the score. NEVER overwrite a prior payout's reward_millicents (it
  // backs both the once-per-song gate and the daily-cap count).
  if (alreadyRewarded) {
    await query(`UPDATE mood_traces SET agreement = $1 WHERE trace_id = $2`, [agreement, traceId]);
  } else {
    await query(`UPDATE mood_traces SET agreement = $1, reward_millicents = $2 WHERE trace_id = $3`, [
      agreement,
      reward,
      traceId,
    ]);
  }

  // Credit through the EXISTING wallet path, idempotent on a deterministic ref so
  // a retry can never double-pay. Only pay when there's something to pay.
  let newBalanceMillicents: number;
  if (reward > 0) {
    const credited = await creditTopup({
      accountId: userId,
      paymentRef: `mood:${userId}:${songId}`,
      amountMillicents: reward,
      feeCents: 0,
      method: "demo",
      status: "mood_reward",
    });
    newBalanceMillicents = credited.balanceMillicents;
  } else {
    newBalanceMillicents = await liveBalance(userId);
  }

  return {
    traceId,
    coveragePct,
    agreement,
    bootstrap,
    rewardMillicents: reward,
    rewardMinutes: price > 0 ? reward / price : 0,
    newBalanceMillicents,
    alreadyRewarded,
  };
}

/** Read the crowd consensus curve + tags for a song (for the ghost + catalog). */
export async function getConsensus(songId: string): Promise<MoodConsensusResult> {
  const sc = await query<{
    grid_ms: number | null;
    v: (number | null)[] | null;
    e: (number | null)[] | null;
    trace_count: number | null;
  }>(`SELECT grid_ms, v, e, trace_count FROM song_consensus WHERE song_id = $1`, [songId]);
  const row = sc.rows[0];

  const tg = await query<{
    dominant_quadrant: string;
    arc_label: string;
    valence_mean: number;
    energy_mean: number;
    confidence: number;
    source: string;
  }>(
    `SELECT dominant_quadrant, arc_label, valence_mean, energy_mean, confidence, source
       FROM song_mood_tags WHERE song_id = $1`,
    [songId],
  );
  const t = tg.rows[0];

  return {
    songId,
    gridMs: Number(row?.grid_ms ?? GRID_MS),
    traceCount: Number(row?.trace_count ?? 0),
    consensus: { v: row?.v ?? [], e: row?.e ?? [] },
    tags: t
      ? {
          dominantQuadrant: t.dominant_quadrant,
          arcLabel: t.arc_label,
          valenceMean: Number(t.valence_mean),
          energyMean: Number(t.energy_mean),
          confidence: Number(t.confidence),
          source: t.source,
        }
      : null,
  };
}
