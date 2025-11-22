'use client'

import { useCurrentUser } from "@coinbase/cdp-hooks";

export default function ArtistPage() {
  const { currentUser } = useCurrentUser();

  return (
    <div style={{
      flex:1,
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    }}>
      <h1>Listener Dashboard</h1>
      <div>Signed in as {currentUser?.userId}</div>
    </div>
  );
}


