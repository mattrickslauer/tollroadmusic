// /artist/join — artist sign-up. (Was /signup; the old URL now redirects here.)
import type { Metadata } from "next";
import SignupForm from "@/components/SignupForm";

export const metadata: Metadata = {
  title: "TollRoad — Artist sign-up",
  description: "Bring your catalog to TollRoad and get paid for every minute played.",
};

export default function ArtistJoinPage() {
  return (
    <main className="signup-page">
      <div className="hero-bg" />
      <div className="wrap signup-grid">
        <div className="signup-pitch">
          <span className="eyebrow">
            <span className="dot" />
            <span className="mono-label">For artists</span>
          </span>
          <h1 className="signup-title">
            Bring your catalog.
            <br />
            Get paid <span className="serif">per minute.</span>
          </h1>
          <p className="signup-lede">
            No middleman, no shrinking pool. Set your own rate and earn on every
            minute actually played. Sign up takes less than a minute.
          </p>
          <ul className="signup-points">
            <li>Free to join — no upfront fees</li>
            <li>Set your own per-minute price</li>
            <li>Auditable ledger, paid on real plays</li>
          </ul>
        </div>

        <div className="signup-card">
          <h2 className="signup-card-head">Create your artist profile</h2>
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
