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
import { createPrivateKey } from "node:crypto";

const CDN_DOMAIN = process.env.TOLLROAD_CDN_DOMAIN; // e.g. d111.cloudfront.net
const KEY_PAIR_ID = process.env.TOLLROAD_CF_KEY_PAIR_ID;
// PEM. Env-var pipelines (CDK, console, shell) routinely flatten real newlines
// into the literal two-character sequence "\n" or wrap the value in quotes;
// OpenSSL then rejects it with ERR_OSSL_UNSUPPORTED. Normalise both so a valid
// key survives the round-trip. (A truncated/placeholder value still won't
// decode — see cdnSigningHealthy().)
const PRIVATE_KEY = normalizePem(process.env.TOLLROAD_CF_PRIVATE_KEY);

function normalizePem(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.replace(/\\n/g, "\n");
}

/** True only when the CDN is configured AND the private key actually decodes as
 *  a usable signing key. Guards against a dropped/truncated key (e.g. a `cdk
 *  deploy` reverting an out-of-band env var) turning every stream into a 500. */
export function cdnSigningHealthy(): boolean {
  if (!cdnConfigured()) return false;
  try {
    createPrivateKey(PRIVATE_KEY!);
    return true;
  } catch {
    return false;
  }
}

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
