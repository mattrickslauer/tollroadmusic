import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";
import { BACKGROUND } from "../lib/colors";
import Providers from "@/components/Providers";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable}`}
        style={{ backgroundColor: BACKGROUND, color: "#000" }}
      >
        <Providers>
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
                  href="https://x.com/deck"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  @deck
                </a>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
