'use client'

import { useIsSignedIn } from "@coinbase/cdp-hooks";
import PlaybackBar from "./PlaybackBar";

export default function SignedInPlaybackBar() {
  const { isSignedIn } = useIsSignedIn();
  if (!isSignedIn) return null;
  return <PlaybackBar />;
}


