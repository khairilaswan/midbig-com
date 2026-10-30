"use client";

import { formatNumberCompact, formatUsd, formatUsdCompact, pctChange } from "@midbig/shared";
import type { AssetDetail } from "@/lib/types";
import { useLivePrice } from "./live";
import { Change, CoinLogo, displayPrice, Freshness } from "./market";

export function CoinHeader({ asset }: { asset: AssetDetail }) {
  const lp = useLivePrice(asset.id, asset.live);
  const price = displayPrice(asset, lp);
  const scale = asset.refPrice && price ? price / asset.refPrice : 1;
  const mcap = asset.marketCap != null ? asset.marketCap * scale : null;
  const fdv = asset.fdv != null ? asset.fdv * scale : null;

  const stats: [string, string][] = [
    ["Market cap", formatUsdCompact(mcap)],
    ["Fully diluted valuation", formatUsdCompact(fdv)],
    ["24h trading volume", formatUsdCompact(asset.volume24h)],
    ["Circulating supply", supply(asset.circulatingSupply, asset.symbol)],
    ["Total supply", supply(asset.totalSupply, asset.symbol)],
    ["Max supply", asset.maxSupply ? supply(asset.maxSupply, asset.symbol) : "∞"],
    ["All-time high", asset.ath ? `${formatUsd(asset.ath)}${asset.athDate ? ` (${date(asset.athDate)})` : ""}` : "—"],
    ["All-time low", asset.atl ? `${formatUsd(asset.atl)}${asset.atlDate ? ` (${date(asset.atlDate)})` : ""}` : "—"],
  ];

  return (
    <>
      <div className="coin-head">
        <CoinLogo src={asset.image} symbol={asset.symbol} size={40} />
        <h1>
          {asset.name} <span className="sym">{asset.symbol} price</span>
        </h1>
        {asset.rank != null && <span className="badge">Rank #{asset.rank}</span>}
      </div>
      <div className="coin-price">
        <span className="big">{formatUsd(price)}</span>
        <Change value={pctChange(price, asset.ref24h)} />
        <span className="muted">24h</span>
      </div>
      <p className="coin-fresh">
        <Freshness row={asset} lp={lp} verbose />
        {!asset.live && !lp && (
          <span className="muted"> · Not traded on Coinbase or Kraken; price from CoinGecko, refreshed every 15 minutes</span>
        )}
      </p>
      <dl className="stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function supply(v: number | null, symbol: string): string {
  return v == null ? "—" : `${formatNumberCompact(v)} ${symbol}`;
}

function date(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
