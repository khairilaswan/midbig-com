"use client";

import Link from "next/link";
import { formatPct, formatUsd, formatUsdCompact, pctChange, type LivePrice } from "@midbig/shared";
import type { AssetRow } from "@/lib/types";
import { Sparkline } from "./sparkline";
import { isLive, useLivePrice, useNow } from "./live";

/** Price to show: the live exchange price when we have one, else the provider's last price. */
export function displayPrice(row: AssetRow, lp: LivePrice | null): number | null {
  return lp?.p ?? row.refPrice;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Green dot for live prices; amber "Delayed" with the age otherwise. */
export function Freshness({ row, lp, verbose = false }: { row: AssetRow; lp: LivePrice | null; verbose?: boolean }) {
  const now = useNow();
  if (isLive(lp, now)) {
    return (
      <span className="fresh live" title={`Live from ${lp!.src.join(" and ")}`}>
        <i aria-hidden /> {verbose ? `Live · ${lp!.src.map(cap).join(", ")}` : <span className="sr-only">Live</span>}
      </span>
    );
  }
  const asOf = lp?.asOf ?? row.metadataAt;
  return (
    <span className="fresh delayed" title={asOf ? `Price as of ${new Date(asOf).toUTCString()}` : "No recent price"}>
      <i aria-hidden />{" "}
      <span suppressHydrationWarning>
        {verbose ? `Delayed · updated ${asOf ? ago(now - asOf) : "—"}` : "Delayed"}
      </span>
    </span>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Change({ value }: { value: number | null }) {
  const cls = value == null ? "" : value >= 0 ? "up" : "down";
  return <span className={`chg ${cls}`}>{formatPct(value)}</span>;
}

export function CoinLogo({ src, symbol, size = 24 }: { src: string | null; symbol: string; size?: number }) {
  if (!src) {
    return (
      <span className="logo-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
        {symbol.slice(0, 3)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} loading="lazy" className="logo" />;
}

function MarketRow({ row }: { row: AssetRow }) {
  const lp = useLivePrice(row.id, row.live);
  const price = displayPrice(row, lp);
  // Market cap moves with the price between metadata refreshes.
  const mcap = row.marketCap != null && row.refPrice && price ? row.marketCap * (price / row.refPrice) : row.marketCap;
  return (
    <tr>
      <td className="num muted rank">{row.rank ?? "—"}</td>
      <td className="coin">
        <Link href={`/coins/${row.id}`}>
          <CoinLogo src={row.image} symbol={row.symbol} />
          <span className="name">{row.name}</span>
          <span className="sym">{row.symbol}</span>
        </Link>
      </td>
      <td className="num price">
        <span className="price-val">{formatUsd(price)}</span> <Freshness row={row} lp={lp} />
      </td>
      <td className="num">
        <Change value={pctChange(price, row.ref24h)} />
      </td>
      <td className="num hide-sm">
        <Change value={pctChange(price, row.ref7d)} />
      </td>
      <td className="num hide-sm">{formatUsdCompact(mcap)}</td>
      <td className="num hide-md">{formatUsdCompact(row.volume24h)}</td>
      <td className="hide-md spark">
        <Sparkline points={row.sparkline} />
      </td>
    </tr>
  );
}

export function MarketTable({ rows }: { rows: AssetRow[] }) {
  return (
    <div className="table-wrap">
      <table className="market">
        <thead>
          <tr>
            <th className="num rank">#</th>
            <th>Coin</th>
            <th className="num">Price</th>
            <th className="num">24h</th>
            <th className="num hide-sm">7d</th>
            <th className="num hide-sm">Market cap</th>
            <th className="num hide-md">Volume (24h)</th>
            <th className="hide-md">Last 7 days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <MarketRow key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Compact list for gainers and losers. */
export function MoverList({ rows }: { rows: AssetRow[] }) {
  return (
    <ul className="movers">
      {rows.map((r) => (
        <MoverItem key={r.id} row={r} />
      ))}
    </ul>
  );
}

function MoverItem({ row }: { row: AssetRow }) {
  const lp = useLivePrice(row.id, row.live);
  const price = displayPrice(row, lp);
  return (
    <li>
      <Link href={`/coins/${row.id}`}>
        <CoinLogo src={row.image} symbol={row.symbol} size={20} />
        <span className="name">{row.name}</span>
        <span className="sym">{row.symbol}</span>
        <span className="num price-val">{formatUsd(price)}</span>
        <Change value={pctChange(price, row.ref24h)} />
      </Link>
    </li>
  );
}
