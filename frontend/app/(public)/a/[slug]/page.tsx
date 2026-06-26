import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverCatalogPublic } from "@/lib/api/server";
import { resolveCoverSrc } from "@/lib/coverSrc";
import { absoluteUrl, artistPath, findArtist, songPath } from "@/lib/shareUrls";
import { ROUTES } from "@/lib/routes";
import { slugify } from "@/lib/slug";
import ShareCover from "@/components/share/ShareCover";

export const runtime = "nodejs";
export const revalidate = 3600; // ISR: fast cached HTML for crawlers/unfurlers.

type Params = { params: Promise<{ slug: string }> };

function describe(name: string, location: string | null, genre: string | null): string {
  const tail = [genre, location].filter(Boolean).join(", ");
  return `Listen to ${name}${tail ? ` (${tail})` : ""} on TollRoad — pay only for the minutes you actually hear.`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await serverCatalogPublic();
  const artist = catalog && findArtist(catalog, slug);
  if (!artist) return { title: "Artist not found — TollRoad" };

  const title = `${artist.name} — TollRoad`;
  const description = describe(artist.name, artist.location, artist.genre);
  const url = absoluteUrl(artistPath(artist));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ArtistPublicPage({ params }: Params) {
  const { slug } = await params;
  const catalog = await serverCatalogPublic();
  const artist = catalog && findArtist(catalog, slug);
  if (!artist) notFound();

  const tracks = catalog.tracks.filter((t) => t.artistId === artist.id);
  const meta = [artist.genre, artist.location].filter(Boolean).join("  ·  ");
  const listenHref = ROUTES.artistProfile(slugify(artist.name) || artist.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: artist.name,
    url: absoluteUrl(artistPath(artist)),
    ...(artist.genre ? { genre: artist.genre } : {}),
    ...(resolveCoverSrc(artist.avatarKey) ? { image: resolveCoverSrc(artist.avatarKey) } : {}),
  };

  return (
    <>
      <article className="sh-card">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ShareCover coverKey={artist.avatarKey} alt={artist.name} fallback={artist.name} rounded />
        <p className="sh-eyebrow">Artist</p>
        <h1 className="sh-title">{artist.name}</h1>
        {meta && <p className="sh-meta">{meta}</p>}
        {artist.bio && <p className="sh-bio">{artist.bio}</p>}
        <Link className="sh-cta" href={listenHref}>
          Listen on TollRoad →
        </Link>
      </article>

      {tracks.length > 0 && (
        <section className="sh-tracks">
          <h2 className="sh-tracks-head">Tracks</h2>
          <div className="sh-track-grid">
            {tracks.map((t) => (
              <Link key={t.id} href={songPath(t)} className="sh-track">
                <div className="sh-track-cover">
                  <ShareCoverInline coverKey={t.coverImageKey} alt={t.title} fallback={t.title} />
                </div>
                <span className="sh-track-name">{t.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Inline cover for the grid tiles — same fallback logic as ShareCover but
 *  without the outer .sh-cover frame (the tile supplies its own). */
function ShareCoverInline({ coverKey, alt, fallback }: { coverKey: string | null; alt: string; fallback: string }) {
  const src = resolveCoverSrc(coverKey);
  if (!src) {
    return (
      <div className="sh-cover-fallback" aria-hidden="true">
        {(fallback.trim()[0] || "♪").toUpperCase()}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} />;
}
