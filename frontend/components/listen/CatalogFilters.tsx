"use client";

/** Search box + genre chips for the catalog. Controlled by the parent view. */
export default function CatalogFilters({
  genres,
  genre,
  onGenre,
  q,
  onQuery,
}: {
  genres: string[];
  genre: string;
  onGenre: (g: string) => void;
  q: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="lx-filters">
      <div className="lx-search">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          placeholder="Search tracks or artists…"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search the catalog"
        />
      </div>
      <div className="lx-chips">
        {genres.map((g) => (
          <button key={g} className="lx-chip" data-on={genre === g} onClick={() => onGenre(g)}>
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}
