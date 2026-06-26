import { resolveCoverSrc } from "@/lib/coverSrc";

/** Cover/avatar for the public pages. A plain server component (no hooks) so it
 *  renders in the initial HTML for crawlers. Falls back to a branded gradient
 *  tile with the title/name's first letter when there is no cover key. */
export default function ShareCover({
  coverKey,
  alt,
  fallback,
  rounded,
}: {
  coverKey: string | null | undefined;
  alt: string;
  fallback: string;
  rounded?: boolean;
}) {
  const src = resolveCoverSrc(coverKey);
  const cls = rounded ? "sh-cover sh-avatar" : "sh-cover";
  if (!src) {
    return (
      <div className={cls}>
        <div className="sh-cover-fallback" aria-hidden="true">
          {(fallback.trim()[0] || "♪").toUpperCase()}
        </div>
      </div>
    );
  }
  return (
    <div className={cls}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
    </div>
  );
}
