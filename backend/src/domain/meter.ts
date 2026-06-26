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

// Metered events exist only to drive the projector (and short-term reverse
// lookups); the durable record lives in DSQL, so they carry a generous TTL and
// then expire.
export const METER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface MeterEvent {
  accountId: string;
  trackId: string;
  artistId: string;
  /** Charge amount in millicents for this metered minute. */
  amountMillicents: number;
  /** Wall-clock minute the charge billed; pin the SAME value the debit used so
   *  the idempotency key lines up. Defaults to the current minute. */
  minuteEpoch?: number;
}

/** Build the canonical METER item (DynamoDB AttributeValue map) for a metered
 *  minute. Insert it with `ConditionExpression attribute_not_exists(PK)` so there
 *  is exactly one stream INSERT — hence one ledger row — per unique
 *  (user, minute, track). */
export function meterEventItem(
  e: MeterEvent,
  minuteEpoch = e.minuteEpoch ?? currentMinuteEpoch(),
): Record<string, AttributeValue> {
  const key = `${e.accountId}#${e.trackId}#${minuteEpoch}`;
  const ttl = Math.floor(Date.now() / 1000) + METER_TTL_SECONDS;
  return {
    PK: { S: `USER#${e.accountId}` },
    SK: { S: `EVT#${minuteEpoch}#${e.trackId}` },
    type: { S: "METER" }, // the stream filter the projector subscribes to
    idempotencyKey: { S: key },
    userId: { S: e.accountId },
    trackId: { S: e.trackId },
    artistId: { S: e.artistId },
    minuteEpoch: { N: String(minuteEpoch) },
    amountMillicents: { N: String(e.amountMillicents) },
    // GSI1 — reverse lookup ARTIST#<id> → recent metered events.
    GSI1PK: { S: `ARTIST#${e.artistId}` },
    GSI1SK: { S: `EVT#${minuteEpoch}#${e.accountId}` },
    ttl: { N: String(ttl) },
  };
}
