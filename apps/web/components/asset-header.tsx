"use client";

import {
  CURRENCY_NAMES,
  forexDecimals,
  formatAssetPrice,
  formatNumberCompact,
  formatUsd,
  formatUsdCompact,
  pctChange,
} from "@midbig/shared";
import type { AssetDetail } from "@/lib/types";
import { useLivePrice } from "./live";
import { Change, CoinLogo, displayPrice, Freshness } from "./market";

/** "NASDAQ NMS - GLOBAL MARKET" -> "Nasdaq". */
export function exchangeName(raw: string | null): string {
  if (!raw) return "—";
  if (/nasdaq/i.test(raw)) return "Nasdaq";
  if (/new york stock exchange|nyse/i.test(raw)) return "NYSE";
  if (/cboe|bats/i.test(raw)) return "Cboe";
  return raw;
}

function num(details: AssetDetail["details"], key: string): number | null {
  const v = details[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function range(lo: number | null, hi: number | null): string {
  return lo != null && hi != null ? `${formatUsd(lo)} – ${formatUsd(hi)}` : "—";
}

export function StockHeader({ asset }: { asset: AssetDetail }) {
  const lp = useLivePrice(asset.id, asset.live);
  const price = displayPrice(asset, lp);
  const d = asset.details;
  const mcap =
    asset.circulatingSupply != null && price != null ? asset.circulatingSupply * price : asset.marketCap;
  const pe = num(d, "pe");
  const dy = num(d, "dividend_yield");
  const beta = num(d, "beta");
  // The day's range from the last quote, stretched by live trades since.
  const lo = num(d, "day_low");
  const hi = num(d, "day_high");
  const dayLo = lo != null && price != null ? Math.min(lo, price) : lo;
  const dayHi = hi != null && price != null ? Math.max(hi, price) : hi;
  const avgVol = num(d, "avg_volume_10d");

  const stats: [string, string][] = [
    ["Market cap", formatUsdCompact(mcap)],
    ["P/E ratio (TTM)", pe != null && pe > 0 ? pe.toFixed(1) : "—"],
    ["Dividend yield", dy != null ? `${dy.toFixed(2)}%` : "—"],
    ["Beta (vs. S&P 500)", beta != null ? beta.toFixed(2) : "—"],
    ["Day range", range(dayLo, dayHi)],
    ["52-week range", range(num(d, "week52_low"), num(d, "week52_high"))],
    ["Previous close", formatUsd(num(d, "prev_close") ?? asset.ref24h)],
    ["Avg. daily volume (10 days)", avgVol != null ? `${formatNumberCompact(avgVol)} shares` : "—"],
    ["Shares outstanding", formatNumberCompact(asset.circulatingSupply)],
    ["Sector", asset.sector ?? "—"],
    ["Exchange", exchangeName(asset.exchange)],
  ];

  return (
    <>
      <div className="coin-head">
        <CoinLogo src={asset.image} symbol={asset.symbol} size={40} />
        <h1>
          {asset.name} <span className="sym">{asset.symbol} stock price</span>
        </h1>
        {asset.rank != null && <span className="badge">S&amp;P 500 #{asset.rank}</span>}
      </div>
      <div className="coin-price">
        <span className="big">{formatUsd(price)}</span>
        <Change value={pctChange(price, asset.ref24h)} />
        <span className="muted">today</span>
      </div>
      <p className="coin-fresh">
        <Freshness row={asset} lp={lp} verbose />
      </p>
      <Stats stats={stats} />
    </>
  );
}

export function ForexHeader({ asset }: { asset: AssetDetail }) {
  const lp = useLivePrice(asset.id, asset.live);
  const rate = displayPrice(asset, lp);
  const [base = "", quote = ""] = asset.symbol.split("/");
  const inverse = rate ? 1 / rate : null;
  const stats: [string, string][] = [
    [`1 ${base} buys`, rate != null ? `${formatAssetPrice(asset.id, rate)} ${quote}` : "—"],
    [
      `1 ${quote} buys`,
      inverse != null
        ? `${inverse.toLocaleString("en-US", { maximumFractionDigits: forexDecimals(inverse) })} ${base}`
        : "—",
    ],
    ["7-day change", pctText(pctChange(rate, asset.ref7d))],
    ["Base currency", CURRENCY_NAMES[base] ?? base],
    ["Quote currency", CURRENCY_NAMES[quote] ?? quote],
  ];
  return (
    <>
      <div className="coin-head">
        <CoinLogo src={null} symbol={base} size={40} />
        <h1>
          {asset.symbol} <span className="sym">{asset.name} rate</span>
        </h1>
      </div>
      <div className="coin-price">
        <span className="big">{formatAssetPrice(asset.id, rate)}</span>
        <Change value={pctChange(rate, asset.ref24h)} />
        <span className="muted">24h</span>
      </div>
      <p className="coin-fresh">
        <Freshness row={asset} lp={lp} verbose />
      </p>
      <Stats stats={stats} />
    </>
  );
}

function pctText(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function Stats({ stats }: { stats: [string, string][] }) {
  return (
    <dl className="stats">
      {stats.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
