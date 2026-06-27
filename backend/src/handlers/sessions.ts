// DJ session endpoints — stateful no-repeat track selection on top of /discover.
//
// POST /v1/sessions          { context }         → { sessionId, track, streamGrant }
// POST /v1/sessions/{id}/next { signal? }         → { track, streamGrant } | { done: true }
//
// Session state is persisted in DynamoDB (`PK=SESSION#<id>`, `SK=META`) so it
// survives Lambda warm/cold cycles. The DynamoDB client follows the lazy-init
// pattern from domain/wallet-store.ts — the AWS SDK is available in the Lambda
// runtime and is NOT bundled.
//
// Stream-grant generation reuses domain/streaming.ts (signedStreamUrl) — no signing
// logic is re-implemented here. The billing gate (/stream/{trackId}) is a separate
// concern; DJ sessions return the grant so the client can immediately begin playback
// after charging through the normal /charge path.
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";
import { type Handler, ok, error, requireSession } from "../lib/http.ts";
import { sessionConfigured } from "../lib/jwt.ts";
import { walletStoreConfigured } from "../domain/wallet-store.ts";
import { vectorConfigured } from "../lib/vectordb.ts";
import { pickNext } from "../domain/dj.ts";
import { runDiscovery } from "./discover.ts";
import {
  signedStreamUrl,
  cdnConfigured,
  cdnSigningHealthy,
  GRANT_TTL_SECONDS,
  type StreamGrant,
} from "../domain/streaming.ts";
import { getTrackBilling } from "../domain/tracks.ts";

// ── DynamoDB session store ───────────────────────────────────────────────────
// Mirrors the wallet-store.ts client + key pattern. Same TABLE env var; if it
// isn't set, walletStoreConfigured() returns false and the handlers return 503.

const REGION = process.env.TOLLROAD_DSQL_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const TABLE = process.env.TOLLROAD_TABLE;
const API_BASE = process.env.TOLLROAD_API_BASE ?? "";

let _sdk: Promise<typeof import("@aws-sdk/client-dynamodb")> | null = null;
let _client: import("@aws-sdk/client-dynamodb").DynamoDBClient | null = null;

async function getSdk() {
  if (!_sdk) _sdk = import("@aws-sdk/client-dynamodb");
  const m = await _sdk;
  if (!_client) _client = new m.DynamoDBClient({ region: REGION });
  return { client: _client, m };
}

function sessionKey(sessionId: string): Record<string, AttributeValue> {
  return { PK: { S: `SESSION#${sessionId}` }, SK: { S: "META" } };
}

interface SessionState {
  context: string;
  played: string[];
  ownerId: string;
}

async function loadSession(sessionId: string): Promise<SessionState | null> {
  const { client, m } = await getSdk();
  const res = await client.send(
    new m.GetItemCommand({
      TableName: TABLE!,
      Key: sessionKey(sessionId),
      ConsistentRead: true,
    }),
  );
  if (!res.Item) return null;
  return {
    context: res.Item.context?.S ?? "",
    played: res.Item.played?.L?.map((v) => v.S ?? "") ?? [],
    ownerId: res.Item.ownerId?.S ?? "",
  };
}

async function saveSession(sessionId: string, context: string, played: string[], ownerId: string): Promise<void> {
  const { client, m } = await getSdk();
  await client.send(
    new m.PutItemCommand({
      TableName: TABLE!,
      Item: {
        ...sessionKey(sessionId),
        context: { S: context },
        played: { L: played.map((id) => ({ S: id })) },
        ownerId: { S: ownerId },
        updatedAt: { N: String(Date.now()) },
      },
    }),
  );
}

// ── Stream-grant builder ─────────────────────────────────────────────────────
// Reuses signedStreamUrl from domain/streaming.ts (no re-implementation of
// CloudFront signing). Proxy fallback mirrors stream.ts behaviour.

function buildStreamGrant(trackId: string, audioKey: string): StreamGrant {
  const signed = signedStreamUrl(audioKey);
  if (signed) return signed;
  return {
    url: `${API_BASE}/stream/${trackId}/raw`,
    expiresAt: Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS,
    mode: "proxy",
  };
}

// ── Guards ───────────────────────────────────────────────────────────────────

function configGuard(): ReturnType<typeof error> | null {
  if (!sessionConfigured()) return error(503, "session auth not configured");
  if (!walletStoreConfigured()) return error(503, "session store not configured");
  if (!vectorConfigured()) return error(503, "vector search not configured");
  return null;
}

// ── POST /v1/sessions ────────────────────────────────────────────────────────

export const startSession: Handler = async (req) => {
  const guard = configGuard();
  if (guard) return guard;
  const principal = await requireSession(req);

  const b = (req.body ?? {}) as Record<string, unknown>;
  const context = typeof b.context === "string" ? b.context.trim() : "";
  if (!context) return error(400, "context required");

  // Discover candidates for the vibe context.
  const candidates = await runDiscovery(context);
  if (!candidates.length) return error(404, "no tracks found for context");

  // Pick first track (no plays yet).
  const trackId = pickNext(
    candidates.map((c) => ({ trackId: c.id, score: c.score })),
    new Set(),
  );
  if (!trackId) return error(404, "no tracks found for context");

  // Persist session state, recording the owner so nextTrack can enforce access.
  const sessionId = randomUUID();
  await saveSession(sessionId, context, [trackId], principal.sub);

  const track = candidates.find((c) => c.id === trackId)!;

  // Build stream grant (CDN signed URL or proxy fallback).
  if (cdnConfigured() && !cdnSigningHealthy()) {
    console.error("sessions: CDN configured but signing key is invalid");
    return error(503, "streaming temporarily unavailable");
  }
  const billing = await getTrackBilling(trackId);
  const streamGrant = billing ? buildStreamGrant(trackId, billing.audioKey) : null;

  return ok({ sessionId, track, streamGrant });
};

// ── POST /v1/sessions/{id}/next ──────────────────────────────────────────────

export const nextTrack: Handler = async (req) => {
  const guard = configGuard();
  if (guard) return guard;
  const principal = await requireSession(req);

  const sessionId = req.params.id;
  if (!sessionId) return error(400, "session id required");

  const session = await loadSession(sessionId);
  if (!session) return error(404, "session not found");
  if (session.ownerId !== principal.sub) return error(403, "not your session");

  const b = (req.body ?? {}) as Record<string, unknown>;
  // Use the caller's signal text if provided; fall back to the original context.
  const signal = typeof b.signal === "string" ? b.signal.trim() : "";
  const vibe = signal || session.context;

  const candidates = await runDiscovery(vibe);
  const played = new Set(session.played);
  const trackId = pickNext(
    candidates.map((c) => ({ trackId: c.id, score: c.score })),
    played,
  );

  if (!trackId) {
    // All discovered candidates have been played — signal exhaustion to the client.
    return ok({ done: true });
  }

  // Append to played list and persist.
  await saveSession(sessionId, session.context, [...session.played, trackId], session.ownerId);

  const track = candidates.find((c) => c.id === trackId)!;

  if (cdnConfigured() && !cdnSigningHealthy()) {
    console.error("sessions: CDN configured but signing key is invalid");
    return error(503, "streaming temporarily unavailable");
  }
  const billing = await getTrackBilling(trackId);
  const streamGrant = billing ? buildStreamGrant(trackId, billing.audioKey) : null;

  return ok({ track, streamGrant });
};
