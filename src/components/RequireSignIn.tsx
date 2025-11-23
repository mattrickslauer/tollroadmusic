'use client'

import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { ACCENT } from "@/lib/colors";

export default function RequireSignIn(props: { children?: React.ReactNode }) {
  const { isSignedIn, isLoading } = useIsSignedIn();
  if (isLoading) return null;
  if (!isSignedIn) {
    return (
      <div
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          background: "none",
        }}
      >
        <h2
          style={{
            fontSize: "3rem",
            fontWeight: 900,
            letterSpacing: "0.04em",
            margin: 0,
            color: ACCENT,
            textShadow: "0 2px 16px #0009",
          }}
        >
          Must Sign In To View this page
        </h2>
      </div>
    );
  }
  return <>{props.children || null}</>;
}








