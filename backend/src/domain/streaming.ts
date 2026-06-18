// Turn a paid play into a way to fetch the audio bytes.
//
// PRIMARY (prod): issue a short-lived CloudFront SIGNED URL for the encrypted S3
// object served via OAC + SSE-KMS. The bytes stream straight from the CDN — they
// never pass through API Gateway/Lambda (which caps payloads at 10 MB anyway).
// The signing keypair is the CloudFront key group registered in the CDK stack;
// the private key is held in TOLLROAD_CF_PRIVATE_KEY.
//
// FALLBACK (local dev): when no CDN is configured, the stream handler proxies the
// bytes itself via domain/media.ts. The billing gate applies in both modes.
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const CDN_DOMAIN = process.env.TOLLROAD_CDN_DOMAIN; // e.g. d111.cloudfront.net
const KEY_PAIR_ID = process.env.TOLLROAD_CF_KEY_PAIR_ID;
const PRIVATE_KEY = process.env.TOLLROAD_CF_PRIVATE_KEY; // PEM

/** Seconds a stream grant is valid — comfortably longer than the ~45s renew
 *  cadence so playback never stalls mid-minute, short enough to be a real gate. */
export const GRANT_TTL_SECONDS = 150;

export function cdnConfigured(): boolean {
  return Boolean(CDN_DOMAIN && KEY_PAIR_ID && PRIVATE_KEY);
}

export interface StreamGrant {
  url: string;
  expiresAt: number; // epoch seconds
  mode: "signed-url" | "proxy";
}

/** Build a signed CloudFront URL for a track's audio object. Returns null when
 *  the CDN isn't configured (caller falls back to the proxy). */
export function signedStreamUrl(audioKey: string, nowMs = Date.now()): StreamGrant | null {
  if (!cdnConfigured()) return null;
  const rel = audioKey.replace(/^\/+/, "");
  const expiresAt = Math.floor(nowMs / 1000) + GRANT_TTL_SECONDS;
  const url = getSignedUrl({
    url: `https://${CDN_DOMAIN}/${rel}`,
    keyPairId: KEY_PAIR_ID!,
    privateKey: PRIVATE_KEY!,
    dateLessThan: new Date(expiresAt * 1000).toISOString(),
  });
  return { url, expiresAt, mode: "signed-url" };
}
