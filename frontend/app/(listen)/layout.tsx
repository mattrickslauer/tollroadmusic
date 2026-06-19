// (listen) — the dark, immersive listener app. Playback (the PlayerProvider +
// <audio> element) and the now-playing bar now live globally in the root layout
// (see components/GlobalPlayer), so the meter survives navigation OUT of the
// listener app too. This layout just renders the dark shell + sidebar; the
// .app-dark scope swaps in the dark design system from styles/tokens.css.
import Sidebar from "@/components/listen/Sidebar";
import AuthButton from "@/components/AuthButton";

export default function ListenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-dark lx-app">
      <Sidebar />
      <main className="lx-main">
        <header className="lx-topbar">
          <div className="lx-topbar-acct">
            <AuthButton />
          </div>
        </header>
        <div className="lx-content">{children}</div>
      </main>
    </div>
  );
}
