'use client'

import { CDPReactProvider } from "@coinbase/cdp-react";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CDPReactProvider
      config={{
        projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID || "your-project-id",
        ethereum: {
          createOnLogin: "eoa",
        },
        appName: "TollRoad Music",
      }}
    >
      <AuthNavigator>
        {children}
      </AuthNavigator>
    </CDPReactProvider>
  );
}

function AuthNavigator({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useIsSignedIn();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(function navigateByAuth() {
    if (!pathname) return;
    if (!isSignedIn && (pathname.startsWith("/listener") || pathname.startsWith("/artist"))) {
      router.replace("/auth");
      return;
    }
    if (isSignedIn && pathname === "/auth") {
      router.replace("/listener");
      return;
    }
  }, [isSignedIn, pathname, router]);

  return <>{children}</>;
}


