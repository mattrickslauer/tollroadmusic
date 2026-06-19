"use client";

// Landing-page sign-up call to action. Opens the email sign-in sheet right on the
// marketing page; on success it sends the new listener to /browse, where the
// onboarding flow greets them and hands over their free $3 (300 minutes).

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignInSheet from "@/components/SignInSheet";

export default function SignupCta({ className = "" }: { className?: string }) {
  const [sheet, setSheet] = useState(false);
  const router = useRouter();

  return (
    <>
      <button className={`btn btn-green${className ? ` ${className}` : ""}`} onClick={() => setSheet(true)}>
        Sign up — get 300 minutes free →
      </button>
      {sheet && (
        <SignInSheet
          reason="Create your account and we'll drop $3 — 300 minutes of listening — into your wallet, on us."
          onClose={() => setSheet(false)}
          onSignedIn={() => { setSheet(false); router.push("/browse"); }}
        />
      )}
    </>
  );
}
