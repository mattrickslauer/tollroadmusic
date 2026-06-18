"use client";

import { useState } from "react";

const PLACEHOLDER = "/covers/placeholder.svg";

/** Album-cover <img> that degrades to the placeholder when the cover key is
 *  absent OR the asset itself 404s (a stale/missing key). Without the onError
 *  fallback a non-null-but-broken key renders as a broken image rather than the
 *  placeholder — which is why every track showed a 404 cover. */
export default function CoverImage({
  coverKey,
  className,
  alt = "",
  loading = "lazy",
}: {
  coverKey?: string | null;
  className?: string;
  alt?: string;
  loading?: "lazy" | "eager";
}) {
  const [broken, setBroken] = useState(false);
  const src = broken || !coverKey ? PLACEHOLDER : coverKey;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={src} alt={alt} loading={loading} onError={() => setBroken(true)} />
  );
}
