// Shown while the /wallet server component reads the session + loads the balance
// and streaming history. Mirrors the page header + WalletPanel as a shell.
import { SkeletonWallet } from "@/components/listen/Skeleton";

export default function WalletLoading() {
  return (
    <>
      <header className="lx-head">
        <span className="lx-eyebrow">Your wallet</span>
        <h1 className="lx-h1">Balance &amp; streaming history.</h1>
        <p className="lx-sub">Every minute you listen is drawn from your prepaid balance. Here&apos;s what you have and what you&apos;ve played.</p>
      </header>
      <SkeletonWallet />
    </>
  );
}
