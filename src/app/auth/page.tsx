'use client'

import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthPage() {
  const { isSignedIn } = useIsSignedIn();
  const router = useRouter();

  useEffect(function handleSignedInRedirect() {
    if (isSignedIn) {
      router.replace("/listener");
    }
  }, [isSignedIn, router]);

  return (
    <div style={{
      flex:1,
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16
    }}>
      <h2>Please sign in</h2>
      <AuthButton />
    </div>
  );
}


