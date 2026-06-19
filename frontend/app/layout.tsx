import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import "@/styles/tokens.css";
import "@/styles/listen.css";
import GlobalPlayer from "@/components/GlobalPlayer";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TollRoad — Pay for the minutes you actually hear",
  description:
    "The metered-billing DSP for music. You pay for the minutes you actually listen — artists get paid for the minutes you actually played. Streaming, metered like a utility.",
  metadataBase: new URL("https://tollroad.music"),
  openGraph: {
    title: "TollRoad — Pay for the minutes you actually hear",
    description:
      "Streaming, metered like a utility. Pay per minute played. Artists earn per minute heard.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${jetbrains.variable} ${manrope.variable}`}
      >
        <GlobalPlayer>{children}</GlobalPlayer>
      </body>
    </html>
  );
}
