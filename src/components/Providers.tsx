'use client'

import { CDPReactProvider, type Theme } from "@coinbase/cdp-react";

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
          createOnLogin: "smart",
        },
        authMethods: ["email", "sms", "oauth:google", "oauth:apple", "oauth:x"],
        appName: "TollRoad Music",
      }}
        theme={theme}
    >
      {children}
    </CDPReactProvider>
  );
}
