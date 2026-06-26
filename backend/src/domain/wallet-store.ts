// The DynamoDB command store (single table `tollroad`) — the write / hot path of
// the polyglot-CQRS split (design §2/§3). Everything that gates money or playback
// in REAL TIME lives here: the authoritative balance, the conditional per-minute
// debit, the metered-event stream that feeds the projector, and top-up credits.
// Aurora DSQL is the eventually-consistent read model, built ONLY by the projector
// Lambda — this module never writes DSQL.
//
// Idempotency key everywhere: `<user>#<track>#<minuteEpoch>`. The per-minute debit
// and its METER event are written in ONE TransactWriteItems so a minute can never
// debit-without-recording or record-without-debiting; the conditional
// `attribute_not_exists` on the METER item makes a replayed minute a no-op (the
// balance is untouched and `charged:false` is returned). Top-ups are likewise
// idempotent on `paymentRef`.
import type { AttributeValue, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { currentMinuteEpoch, LIKE_COST_CENTS } from "./billing.ts";
import { meterEventItem } from "./meter.ts";

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const TABLE = process.env.TOLLROAD_TABLE;

export function walletStoreConfigured(): boolean {
  return Boolean(TABLE);
}

// Lazily import the SDK and reuse one client across warm invocations (same posture
// as domain/meter.ts and lib/dsql.ts). The Node 20 Lambda runtime ships @aws-sdk/*,
// so it isn't bundled.
let sdk: Promise<typeof import("@aws-sdk/client-dynamodb")> | null = null;
let client: import("@aws-sdk/client-dynamodb").DynamoDBClient | null = null;
async function getSdk() {
  if (!sdk) sdk = import("@aws-sdk/client-dynamodb");
  const m = await sdk;
  if (!client) client = new m.DynamoDBClient({ region: REGION });
  return { client, m };
}

function balanceKey(accountId: string): Record<string, AttributeValue> {
  return { PK: { S: `USER#${accountId}` }, SK: { S: "BAL" } };
}

// A strongly-consistent read of the authoritative balance — the realtime field
// gates money, so it must reflect a debit/credit that committed milliseconds ago.
async function readBalance(accountId: string): Promise<number> {
  const { client, m } = await getSdk();
  const res = await client.send(
    new m.GetItemCommand({
      TableName: TABLE,
      Key: balanceKey(accountId),
      ProjectionExpression: "balanceCents",
      ConsistentRead: true,
    }),
  );
  return Number(res.Item?.balanceCents?.N ?? 0);
}

function isCanceled(err: unknown): TransactionCanceledException | null {
  return (err as { name?: string })?.name === "TransactionCanceledException"
    ? (err as TransactionCanceledException)
    : null;
}

export interface DebitInput {
  accountId: string;
  trackId: string;
  artistId: string;
  amountCents: number;
  minuteEpoch?: number;
}
export type DebitResult =
  | { ok: true; balanceCents: number; charged: boolean }
  | { ok: false; reason: "insufficient"; balanceCents: number };

/** Conditionally debit one metered minute AND record its METER event in a single
 *  transaction. The METER INSERT (`attribute_not_exists`) is what fires the stream
 *  → projector → DSQL ledger; the command path itself never touches DSQL. */
export async function debitMinute(input: DebitInput): Promise<DebitResult> {
  if (!TABLE) throw new Error("TOLLROAD_TABLE is not set");
  const minuteEpoch = input.minuteEpoch ?? currentMinuteEpoch();
  const amt = input.amountCents;
  const { client, m } = await getSdk();

  try {
    await client.send(
      new m.TransactWriteItemsCommand({
        TransactItems: [
          {
            // [0] Conditional debit — the authoritative balance can never go
            // negative (a missing BAL item fails `balanceCents >= :amt` too).
            Update: {
              TableName: TABLE,
              Key: balanceKey(input.accountId),
              UpdateExpression: "ADD balanceCents :neg",
              ConditionExpression: "balanceCents >= :amt",
              ExpressionAttributeValues: { ":neg": { N: String(-amt) }, ":amt": { N: String(amt) } },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD",
            },
          },
          {
            // [1] One stream INSERT (→ one ledger row) per unique metered minute.
            Put: {
              TableName: TABLE,
              Item: meterEventItem(input, minuteEpoch),
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
        ],
      }),
    );
  } catch (err) {
    const cancel = isCanceled(err);
    const reasons = cancel?.CancellationReasons;
    if (reasons) {
      // Check the METER guard first: a replayed minute is an idempotent no-op
      // regardless of the current balance (the listener was already billed).
      if (reasons[1]?.Code === "ConditionalCheckFailed") {
        return { ok: true, balanceCents: await readBalance(input.accountId), charged: false };
      }
      if (reasons[0]?.Code === "ConditionalCheckFailed") {
        // Insufficient funds — ALL_OLD hands us the live balance to surface.
        return { ok: false, reason: "insufficient", balanceCents: Number(reasons[0].Item?.balanceCents?.N ?? 0) };
      }
    }
    throw err;
  }

  // Committed: a genuinely new charge. Read back the authoritative balance.
  return { ok: true, balanceCents: await readBalance(input.accountId), charged: true };
}

/** Conditionally debit a one-time 1¢ like-tip AND record its METER event in a
 *  single transaction — the exact same shape as debitMinute, but keyed
 *  '<user>#<track>#like' (no minute) with SK suffix `like`, so it coexists with
 *  metered minutes for the same (user, track) and is charged at most once ever.
 *  The METER INSERT (`attribute_not_exists`) fires the stream → projector → DSQL
 *  ledger; the command path itself never touches DSQL. `charged:false` means the
 *  like was already paid for (idempotent replay); a re-like is therefore free. */
export async function debitLike(input: { accountId: string; trackId: string; artistId: string }): Promise<DebitResult> {
  if (!TABLE) throw new Error("TOLLROAD_TABLE is not set");
  const minuteEpoch = currentMinuteEpoch();
  const amt = LIKE_COST_CENTS;
  const { client, m } = await getSdk();

  try {
    await client.send(
      new m.TransactWriteItemsCommand({
        TransactItems: [
          {
            // [0] Conditional debit — the authoritative balance can never go
            // negative (a missing BAL item fails `balanceCents >= :amt` too).
            Update: {
              TableName: TABLE,
              Key: balanceKey(input.accountId),
              UpdateExpression: "ADD balanceCents :neg",
              ConditionExpression: "balanceCents >= :amt",
              ExpressionAttributeValues: { ":neg": { N: String(-amt) }, ":amt": { N: String(amt) } },
              ReturnValuesOnConditionCheckFailure: "ALL_OLD",
            },
          },
          {
            // [1] One stream INSERT (→ one ledger row) per like, ever. Keyed
            // '<user>#<track>#like' with SK suffix `like` so it never collides
            // with a metered minute for the same (user, track).
            Put: {
              TableName: TABLE,
              Item: meterEventItem({
                accountId: input.accountId,
                trackId: input.trackId,
                artistId: input.artistId,
                amountCents: LIKE_COST_CENTS,
                minuteEpoch,
                idempotencyKey: `${input.accountId}#${input.trackId}#like`,
                skSuffix: "like",
              }, minuteEpoch),
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
        ],
      }),
    );
  } catch (err) {
    const cancel = isCanceled(err);
    const reasons = cancel?.CancellationReasons;
    if (reasons) {
      // Check the METER guard first: a replayed like is an idempotent no-op
      // regardless of the current balance (the listener was already billed).
      if (reasons[1]?.Code === "ConditionalCheckFailed") {
        return { ok: true, balanceCents: await readBalance(input.accountId), charged: false };
      }
      if (reasons[0]?.Code === "ConditionalCheckFailed") {
        // Insufficient funds — ALL_OLD hands us the live balance to surface.
        return { ok: false, reason: "insufficient", balanceCents: Number(reasons[0].Item?.balanceCents?.N ?? 0) };
      }
    }
    throw err;
  }

  // Committed: a genuinely new like-charge. Read back the authoritative balance.
  return { ok: true, balanceCents: await readBalance(input.accountId), charged: true };
}

export interface CreditInput {
  accountId: string;
  paymentRef: string;
  amountCents: number;
  method: string;
  status: string;
  /** Optional: persisted on the TOPUP event so the projector can fill
   *  `wallet_topups.fee_cents`. Not part of the §5 contract; defaults to 0. */
  feeCents?: number;
}
export type CreditResult = { credited: boolean; balanceCents: number };

/** Credit the authoritative balance and emit a TOPUP event, idempotent on
 *  `paymentRef`. The TOPUP event drives the projector's DSQL reconciliation +
 *  `wallet_topups` insert. A replayed paymentRef neither re-credits nor re-emits. */
export async function creditBalance(input: CreditInput): Promise<CreditResult> {
  if (!TABLE) throw new Error("TOLLROAD_TABLE is not set");
  const { client, m } = await getSdk();

  try {
    await client.send(
      new m.TransactWriteItemsCommand({
        TransactItems: [
          {
            // [0] Idempotency guard: one TOPUP event per paymentRef. If it already
            // exists the whole transaction cancels and the balance is untouched.
            // No TTL — the guard must outlive any webhook redelivery window.
            Put: {
              TableName: TABLE,
              Item: {
                PK: { S: `USER#${input.accountId}` },
                SK: { S: `TOPUP#${input.paymentRef}` },
                type: { S: "TOPUP" }, // the stream filter the projector subscribes to
                paymentRef: { S: input.paymentRef },
                userId: { S: input.accountId },
                amountCents: { N: String(input.amountCents) },
                feeCents: { N: String(input.feeCents ?? 0) },
                method: { S: input.method },
                status: { S: input.status },
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
          {
            // [1] Credit the authoritative balance (ADD creates the BAL item if
            // it's the account's first money in).
            Update: {
              TableName: TABLE,
              Key: balanceKey(input.accountId),
              UpdateExpression: "ADD balanceCents :credit",
              ExpressionAttributeValues: { ":credit": { N: String(input.amountCents) } },
            },
          },
        ],
      }),
    );
  } catch (err) {
    const cancel = isCanceled(err);
    if (cancel?.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed") {
      // Already credited (idempotent replay) — return the live balance, no credit.
      return { credited: false, balanceCents: await readBalance(input.accountId) };
    }
    throw err;
  }

  return { credited: true, balanceCents: await readBalance(input.accountId) };
}

/** The authoritative real-time balance (DynamoDB BAL item). Returns 0 when the
 *  store is unconfigured so local-dev callers can fall back to the DSQL read. */
export async function getRealtimeBalance(accountId: string): Promise<number> {
  if (!TABLE) return 0;
  return readBalance(accountId);
}

/** Proof-of-recent-payment for the stream gate: did this account meter a minute
 *  for this track within `windowSec`? Reads the realtime METER events, NOT the
 *  lagging DSQL ledger. */
export async function hasRecentMeter(accountId: string, trackId: string, windowSec = 150): Promise<boolean> {
  if (!TABLE) return false;
  const current = currentMinuteEpoch();
  const minFrom = current - Math.ceil(windowSec / 60);
  const { client, m } = await getSdk();
  // SK is `EVT#<minuteEpoch>#<trackId>`. minuteEpoch is equal-width in this era
  // (8 digits until ~2159) so lexicographic order == numeric order: range-scan
  // just this user's events inside the window, then filter to the track (the
  // numeric FilterExpression keeps it correct and drops TOPUP rows, which sort
  // after EVT# and carry no trackId). ConsistentRead so a charge that committed
  // milliseconds ago is visible to the gate that immediately follows it.
  const res = await client.send(
    new m.QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :lo AND :hi",
      FilterExpression: "trackId = :track AND minuteEpoch >= :minFrom",
      ExpressionAttributeValues: {
        ":pk": { S: `USER#${accountId}` },
        ":lo": { S: `EVT#${minFrom}#` },
        ":hi": { S: `EVT#${current + 1}#` },
        ":track": { S: trackId },
        ":minFrom": { N: String(minFrom) },
      },
      Select: "COUNT",
      ConsistentRead: true,
    }),
  );
  return (res.Count ?? 0) > 0;
}
