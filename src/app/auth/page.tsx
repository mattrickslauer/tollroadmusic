'use client'

import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";

export default function AuthPage() {
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


