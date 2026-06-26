"use client";

import { useState } from "react";
import Link from "next/link";
import TopUpSheet from "@/components/TopUpSheet";
import CoverImage from "./listen/CoverImage";
import ArtistLink from "./listen/ArtistLink";

export interface HistoryItem {
  trackId: string;
  title: string;
  artistName: string;
  artistId: string;
  coverImageKey: string | null;
  minutes: number;
  amountMillicents: number;
  lastPlayedEpoch: number;
}

interface Props {
  initialBalanceMillicents: number;
  history: HistoryItem[];
}

const usdM = (m: number) => `$${(m / 100000).toFixed(2)}`;

function whenLabel(minuteEpoch: number): string {
  const d = new Date(minuteEpoch * 60 * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The listener wallet view: current balance + a "add funds" action, and the
 * streaming history (each track's paid minutes and spend, newest first).
 */
export default function WalletPanel({ initialBalanceMillicents, history }: Props) {
  const [balanceMillicents, setBalanceMillicents] = useState(initialBalanceMillicents);
  const [sheet, setSheet] = useState(false);

  const totalSpent = history.reduce((s, h) => s + h.amountMillicents, 0);
  const totalMinutes = history.reduce((s, h) => s + h.minutes, 0);
  const low = balanceMillicents <= 0;

  return (
    <>
      <div className="wallet-top">
        <div className="wallet-balance" data-low={low}>
          <div className="wallet-balance-k">Wallet balance</div>
          <div className="wallet-balance-v">{usdM(balanceMillicents)}</div>
          {low && <div className="wallet-balance-note">Out of funds — add money to keep listening.</div>}
        </div>
        <button className="btn btn-primary" onClick={() => setSheet(true)}>Add funds</button>
      </div>

      <div className="wallet-stats">
        <Stat k="Total spent" v={usdM(totalSpent)} />
        <Stat k="Minutes streamed" v={totalMinutes.toLocaleString("en-US")} />
        <Stat k="Tracks played" v={String(history.length)} />
      </div>

      <h2 className="wallet-h2">Streaming history</h2>
      {history.length === 0 ? (
        <p className="cat-empty">Nothing yet — press play on the <Link href="/browse">catalog</Link> to start.</p>
      ) : (
        <ul className="wallet-history">
          {history.map((h) => (
            <li key={h.trackId} className="wallet-row">
              <CoverImage className="wallet-row-cover" coverKey={h.coverImageKey} />
              <div className="wallet-row-main">
                <div className="wallet-row-title">{h.title}</div>
                <ArtistLink id={h.artistId} name={h.artistName} className="wallet-row-artist" />
              </div>
              <div className="wallet-row-meta">
                <span className="wallet-row-min">{h.minutes} min</span>
                <span className="wallet-row-when">{whenLabel(h.lastPlayedEpoch)}</span>
              </div>
              <div className="wallet-row-amt">{usdM(h.amountMillicents)}</div>
            </li>
          ))}
        </ul>
      )}

      {sheet && (
        <TopUpSheet
          onClose={() => setSheet(false)}
          onFunded={(m) => { setBalanceMillicents(m); setSheet(false); }}
        />
      )}
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="cat-stat">
      <div className="cat-stat-v">{v}</div>
      <div className="cat-stat-k">{k}</div>
    </div>
  );
}
