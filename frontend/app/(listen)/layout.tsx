// (listen) — the dark, immersive listener app. The PlayerProvider + the
// <audio> element live here in the layout, mounted ONCE, so playback and the
// meter survive navigation between listener pages (browse → library → wallet …).
// The .app-dark scope swaps in the dark design system from styles/tokens.css.
import "@/styles/listen.css";
import PlayerProvider from "@/context/PlayerProvider";
import LibraryProvider from "@/context/LibraryProvider";
import Sidebar from "@/components/listen/Sidebar";
import PlayerBar from "@/components/listen/PlayerBar";
import AuthButton from "@/components/AuthButton";

export default function ListenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-dark lx-app">
      <LibraryProvider>
        <PlayerProvider>
          <Sidebar />
          <main className="lx-main">
            <header className="lx-topbar">
              <div className="lx-topbar-acct">
                <AuthButton />
              </div>
            </header>
            <div className="lx-content">{children}</div>
          </main>
          <PlayerBar />
        </PlayerProvider>
      </LibraryProvider>
    </div>
  );
}
