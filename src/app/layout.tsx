import type { Metadata } from "next";
import { Jomhuria } from "next/font/google";
import Image from "next/image";
import { Suspense } from "react";
import "./globals.css";
import { BACKGROUND } from "../lib/colors";
import Providers from "@/components/Providers";
import Header from "@/components/Header";
import PlayerProvider from "@/contexts/PlayerContext";
import SignedInPlaybackBar from "@/components/SignedInPlaybackBar";


const jomhuria = Jomhuria({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-jomhuria",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TollRoad Music",
  description: "Pay-as-you-go music, onchain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jomhuria.className} ${jomhuria.variable}`}
        style={{ backgroundColor: BACKGROUND, color: "#000" }}
      >
        <Suspense>
          <Providers>
            <PlayerProvider>
              <Header />
              {children}
              <footer
              role="contentinfo"
              style={{
                borderTop: "1px solid rgba(0,0,0,0.1)",
                marginTop: "2rem",
                padding: "1.25rem 1rem",
                color: "#000",
              }}
            >
              <div
                style={{
                  maxWidth: "960px",
                  margin: "0 auto",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Image
                    src="/images/mattricks.png"
                    alt="Mattricks Lauer"
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%" }}
                  />
                  <div>
                    <strong>Mattricks Lauer</strong>{" "}
                    <a
                      href="https://x.com/mattrickslauer"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "inherit", textDecoration: "underline" }}
                      aria-label="Mattricks Lauer on X"
                    >
                      @mattrickslauer
                    </a>
                  </div>
                </div>
                <div style={{ opacity: 0.9 }}>
                  <strong>ETHGlobal Buenos Aires Hackathon 2025</strong>
                </div>
                <div>
                  <strong>Partners</strong>:{" "}
                  <a
                    href="https://www.coinbase.com/developer-platform"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    Coinbase Developer Platform
                  </a>
                  {"  ·  "}
                  <a
                    href="https://filecoin.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    Filecoin
                  </a>
                  {"  ·  "}
                  <a
                    href="https://protocol.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    Protocol Labs
                  </a>
                </div>
                <div>
                  <strong>Links</strong>:{" "}
                  <a
                    href="https://www.tollroadmusic.xyz/deck"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    @deck
                  </a>
                </div>
              </div>
              </footer>
              <SignedInPlaybackBar />
            </PlayerProvider>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
