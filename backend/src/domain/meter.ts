// Canonical DynamoDB METER-event item shape (single table `tollroad`). A METER
// item per (user, minute, track) is what the NEW_AND_OLD_IMAGES stream hands to
// the projector Lambda (infra/lambda/projector), which idempotently builds the
// Aurora DSQL royalty ledger + per-artist/day summary + reconciliation balance.
//
// The COMMAND path writes this item TRANSACTIONALLY alongside the conditional
// balance debit (see domain/wallet-store.ts: debitMinute) — there is no longer a
// separate best-effort emit, and the command path never writes the DSQL ledger.
// This module is the single source of truth for the item's byte shape so the
// writer (wallet-store) and the reader (projector) can't drift; the idempotency
// key is `<user>#<track>#<minuteEpoch>`.
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { currentMinuteEpoch } from "./billing.ts";

// Metered minutes exist only to drive the projector (and short-term reverse
// lookups); the durable record lives in DSQL, so they carry a generous TTL and
// then expire. Once-EVER charges (e.g. a like) instead set `noTtl` so their
// idempotency guard never ages out — see meterEventItem.
export const METER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface MeterEvent {
  accountId: string;
  trackId: string;
  artistId: string;
  amountCents: number;
  /** Wall-clock minute the charge billed; pin the SAME value the debit used so
   *  the idempotency key lines up. Defaults to the current minute. */
  minuteEpoch?: number;
  /** Override the ledger idempotency key. Defaults to '<user>#<track>#<minute>'.
   *  Non-minute charges (e.g. a like) pass their own key so the rollup writes the
   *  matching ledger row. When set, also pass `skSuffix` to avoid colliding with a
   *  metered minute for the same (user, track). */
  idempotencyKey?: string;
  /** Replaces the minute in the DynamoDB sort key (`EVT#<skSuffix>#<track>`), so a
   *  non-minute event coexists with a metered minute for the same (user, track). */
  skSuffix?: string;
  /** Omit the TTL so the item — and therefore the `attribute_not_exists`
   *  idempotency guard — is DURABLE. A metered minute may expire after
   *  METER_TTL_SECONDS (a replay of a 30-day-old minute can't happen), but a
   *  once-EVER charge such as a like must keep its guard forever so an
   *  unlike→re-like never charges a second time. */
  noTtl?: boolean;
}

/** Build the canonical METER item (DynamoDB AttributeValue map) for a charge.
 *  Insert it with `ConditionExpression attribute_not_exists(PK)` so there is
 *  exactly one stream INSERT — hence one ledger row — per unique event.
 *
 *  A metered MINUTE keys on `<user>#<track>#<minuteEpoch>` (the defaults). A
 *  non-minute charge (e.g. a like) passes its own `idempotencyKey` AND `skSuffix`
 *  so the projector still writes it one ledger row and its sort key
 *  (`EVT#<skSuffix>#<track>`) coexists with the metered minutes for the same
 *  (user, track) instead of colliding. */
export function meterEventItem(
  e: MeterEvent,
  minuteEpoch = e.minuteEpoch ?? currentMinuteEpoch(),
): Record<string, AttributeValue> {
  const key = e.idempotencyKey ?? `${e.accountId}#${e.trackId}#${minuteEpoch}`;
  const sk = e.skSuffix ?? String(minuteEpoch);
  const item: Record<string, AttributeValue> = {
    PK: { S: `USER#${e.accountId}` },
    SK: { S: `EVT#${sk}#${e.trackId}` },
    type: { S: "METER" }, // the stream filter the projector subscribes to
    idempotencyKey: { S: key },
    userId: { S: e.accountId },
    trackId: { S: e.trackId },
    artistId: { S: e.artistId },
    minuteEpoch: { N: String(minuteEpoch) },
    amountCents: { N: String(e.amountCents) },
    // GSI1 — reverse lookup ARTIST#<id> → recent metered events.
    GSI1PK: { S: `ARTIST#${e.artistId}` },
    GSI1SK: { S: `EVT#${minuteEpoch}#${e.accountId}` },
  };
  // Durable events (e.g. likes) omit the TTL so their idempotency guard never
  // expires; metered minutes carry it and age out.
  if (!e.noTtl) item.ttl = { N: String(Math.floor(Date.now() / 1000) + METER_TTL_SECONDS) };
  return item;
}
