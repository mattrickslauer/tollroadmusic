import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "TollRoad — You're set up",
  description: "Your artist profile and payout setup are complete.",
};

// Stripe's return_url after hosted onboarding. Returning here doesn't guarantee
// payouts are fully enabled (Stripe may still be verifying) — the account.updated
// webhook flips payouts_enabled when it is. So we confirm receipt warmly without
// over-promising.
export default function SignupDonePage() {
  return (
    <>
      <nav className="nav">
        <div className="wrap nav-inner">
          <Link href="/" className="brand">
            <BrandMark />
            TollRoad
          </Link>
          <div className="nav-links">
            <Link href="/">Home</Link>
          </div>
        </div>
      </nav>

      <main className="signup-page">
        <div className="hero-bg" />
        <div className="wrap" style={{ position: "relative", zIndex: 1, maxWidth: 620 }}>
          <div className="signup-done">
            <div className="signup-check" aria-hidden="true">✓</div>
            <h2>You&apos;re on the road.</h2>
            <p>
              Your artist profile is saved and your payout setup with Stripe is underway.
              Stripe may take a little while to finish verifying your details — once it does,
              you&apos;ll be ready to get paid for every minute played.
            </p>
            <Link href="/" className="btn btn-ghost">Back to home</Link>
          </div>
        </div>
      </main>
    </>
  );
}
