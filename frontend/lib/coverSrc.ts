// Resolve a stored cover/avatar key to an <img> src.
//  - http(s)://…            -> as-is (already absolute)
//  - /covers/…  (leading /) -> as-is (legacy Next static assets)
//  - bucket-relative key    -> `${base}/${key}` (uploaded images CDN)
// Returns null when there is no key, so the caller can show its placeholder.
export function resolveCoverSrc(
  key: string | null | undefined,
  base: string = process.env.NEXT_PUBLIC_IMAGES_BASE ?? "",
): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  if (key.startsWith("/")) return key;
  const b = base.replace(/\/+$/, "");
  return b ? `${b}/${key}` : `/${key}`;
}
