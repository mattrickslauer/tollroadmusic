"use client";

// The global player shell. Mounts the library + player context and the <audio>
// element ONCE at the app root, so a track keeps playing — and the now-playing
// bar stays docked — across every route group (marketing, artist, listen), not
// just the dark listener app. Moved up from the (listen) layout; that layout no
// longer owns playback.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import LibraryProvider from "@/context/LibraryProvider";
import PlayerProvider, { usePlayer } from "@/context/PlayerProvider";
import MoodProvider from "@/context/MoodProvider";
import { BondProvider } from "@/context/BondProvider";
import PlayerBar from "@/components/listen/PlayerBar";
import TierUpCelebration from "@/components/bond/TierUpCelebration";

// The dark (listen) experience: there the bar is docked beside the sidebar and
// shown even when idle ("pick a track…"). Everywhere else the bar is global
// chrome — full-width, and only present once something is actually playing, so
// it never clutters the marketing landing or the artist dashboard while empty.
const LISTEN_ROUTES = ["/browse", "/library", "/liked", "/search", "/wallet", "/playlist"];
function isListenRoute(p: string | null): boolean {
  return !!p && LISTEN_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

export default function GlobalPlayer({ children }: { children: React.ReactNode }) {
  return (
    <LibraryProvider>
      <PlayerProvider>
        {/* Inside PlayerProvider so it can read the playing track + metered seconds. */}
        <BondProvider>
          {/* Owns the in-flight Vibe Pad trace; MoodPad (in the player portal) uses it. */}
          <MoodProvider>
            {children}
            <GlobalBar />
            {/* App-wide tier-up celebration — listens for bond tier crossings. */}
            <TierUpCelebration />
          </MoodProvider>
        </BondProvider>
      </PlayerProvider>
    </LibraryProvider>
  );
}

/** Renders the persistent bar and, off the listener app, reserves bottom space
 *  so the fixed bar never hides page content (the listen app pads .lx-main for
 *  this; marketing/artist pages don't, so we pad <body> while it's showing). */
function GlobalBar() {
  const listen = isListenRoute(usePathname());
  const { current } = usePlayer();

  useEffect(() => {
    const show = !listen && !!current;
    document.body.classList.toggle("gp-pad", show);
    return () => document.body.classList.remove("gp-pad");
  }, [listen, current]);

  return (
    // .app-dark feeds the bar its dark tokens even outside the listener app
    // (same trick FullscreenPlayer uses for its body portal).
    <div className="app-dark gp-bar" data-listen={listen}>
      <PlayerBar />
    </div>
  );
}
