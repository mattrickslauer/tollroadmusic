'use client'

import { CDPReactProvider, type Theme } from "@coinbase/cdp-react";
import { useIsSignedIn } from "@coinbase/cdp-hooks";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const theme: Partial<any> = {
  "colors-bg-default": "#0a0b0d",
  "colors-bg-alternate": "#22252d",
  "colors-bg-primary": "#fee514",
  "colors-bg-secondary": "#22252d",
  "colors-fg-default": "#ffffff",
  "colors-fg-muted": "#8a919e",
  "colors-fg-primary": "#fee514",
  "colors-fg-onPrimary": "#0a0b0d",
  "colors-fg-onSecondary": "#ffffff",
  "colors-fg-positive": "#27ad75",
  "colors-fg-negative": "#f0616d",
  "colors-fg-warning": "#ed702f",
  "colors-line-default": "#252629",
  "colors-line-heavy": "#5a5d6a",
  "borderRadius-cta": "var(--cdp-web-borderRadius-full)",
  "borderRadius-link": "var(--cdp-web-borderRadius-full)",
  "borderRadius-input": "var(--cdp-web-borderRadius-lg)",
  "borderRadius-select-trigger": "var(--cdp-web-borderRadius-lg)",
  "borderRadius-select-list": "var(--cdp-web-borderRadius-lg)",
  "borderRadius-modal": "var(--cdp-web-borderRadius-xl)",
  "font-family-mono": "'Source Code Pro', 'Source Code Pro Fallback'",
  "font-family-body": "var(--cdp-web-font-family-mono)",
  "font-family-interactive": "var(--cdp-web-font-family-mono)"
}

export default function Providers({ children }: { children: React.ReactNode }) {

  return (
    <CDPReactProvider
      config={{
        projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID || "your-project-id",
        ethereum: {
          createOnLogin: "eoa",
        },
        authMethods: ["email", "sms", "oauth:google", "oauth:apple", "oauth:x"],
        appName: "TollRoad Music",
      }}
        theme={theme}
    >
      <AuthNavigator>
        {children}
      </AuthNavigator>
    </CDPReactProvider>
  );
}

function AuthNavigator({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading } = useIsSignedIn();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(function navigateByAuth() {
    if (!pathname || isLoading) return;
    if (!isSignedIn && (pathname.startsWith("/listener") || pathname.startsWith("/artist"))) {
      router.replace(`/auth?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (isSignedIn && pathname === "/auth") {
      const dest = searchParams?.get("redirect") || "";
      if (dest.startsWith("/artist") || dest.startsWith("/listener")) {
        router.replace(dest);
      } else {
        router.replace("/listener");
      }
      return;
    }
  }, [isSignedIn, isLoading, pathname, router, searchParams]);

  return <>{children}</>;
}


