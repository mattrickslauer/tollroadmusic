import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverCatalogPublic } from "@/lib/api/server";
import { resolveCoverSrc } from "@/lib/coverSrc";
import { absoluteUrl, artistPath, findTrack, songPath } from "@/lib/shareUrls";
import { ROUTES } from "@/lib/routes";
import { slugify } from "@/lib/slug";
import { clock } from "@/components/listen/format";
import ShareCover from "@/components/share/ShareCover";

export const runtime = "nodejs";
export const revalidate = 3600; // ISR: fast cached HTML for crawlers/unfurlers.

type Params = { params: Promise<{ slug: string }> };

/** ISO-8601 duration ("PT3M20S") for the MusicRecording structured data. */
function isoDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `PT${Math.floor(s / 60)}M${s % 60}S`;
}

function describe(title: string, artist: string): string {
  return `Listen to “${title}” by ${artist} on TollRoad — pay only for the minutes you actually hear.`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await serverCatalogPublic();
  const track = catalog && findTrack(catalog, slug);
  if (!track) return { title: "Song not found — TollRoad" };

  const title = `${track.title} — ${track.artistName}`;
  const description = describe(track.title, track.artistName);
  const url = absoluteUrl(songPath(track));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "music.song" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SongPage({ params }: Params) {
  const { slug } = await params;
  const catalog = await serverCatalogPublic();
  const track = catalog && findTrack(catalog, slug);
  if (!track) notFound();

  const meta = [track.genre, clock(track.durationSeconds), `${track.pricePerMinuteCents}¢/min`]
    .filter(Boolean)
    .join("  ·  ");
  // CTA deep-links into the live app's artist page (no track-focused player URL
  // exists yet); a logged-out visitor flows through sign-in from there.
  const listenHref = ROUTES.artistProfile(slugify(track.artistName) || track.artistId);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: track.title,
    byArtist: {
      "@type": "MusicGroup",
      name: track.artistName,
      "@id": absoluteUrl(artistPath({ id: track.artistId, name: track.artistName })),
    },
    duration: isoDuration(track.durationSeconds),
    url: absoluteUrl(songPath(track)),
    ...(resolveCoverSrc(track.coverImageKey) ? { image: resolveCoverSrc(track.coverImageKey) } : {}),
  };

  return (
    <article className="sh-card">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ShareCover coverKey={track.coverImageKey} alt={`${track.title} cover`} fallback={track.title} />
      <p className="sh-eyebrow">Song</p>
      <h1 className="sh-title">{track.title}</h1>
      <p className="sh-artist">
        by <Link href={artistPath({ id: track.artistId, name: track.artistName })}>{track.artistName}</Link>
      </p>
      <p className="sh-meta">{meta}</p>
      <Link className="sh-cta" href={listenHref}>
        Listen on TollRoad →
      </Link>
    </article>
  );
}
