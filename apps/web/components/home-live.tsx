"use client";

import Link from "next/link";
import { assetPath, formatAssetPrice, pctChange } from "@midbig/shared";
import type { AssetRow } from "@/lib/types";
import { useLivePrice } from "./live";
import { Change, CoinLogo, displayPrice } from "./market";
import { Sparkline } from "./sparkline";

function TapeItem({ row }: { row: AssetRow }) {
  const lp = useLivePrice(row.id, row.live);
  const price = displayPrice(row, lp);
  return (
    <Link href={assetPath(row.id)} className="tape-item">
      <strong>{row.symbol}</strong> <span className="num">{formatAssetPrice(row.id, price)}</span> <Change value={pctChange(price, row.ref24h)} />
    </Link>
  );
}

/** A scrolling strip of live prices. It pauses on hover and for people who prefer less motion. */
export function TickerTape({ rows }: { rows: AssetRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="tape" aria-label="Live prices">
      <div className="tape-track">
        {rows.map((r) => (
          <TapeItem key={r.id} row={r} />
        ))}
        <span aria-hidden className="tape-copy">
          {rows.map((r) => (
            <TapeItem key={`c-${r.id}`} row={r} />
          ))}
        </span>
      </div>
    </div>
  );
}

function Tile({ row }: { row: AssetRow }) {
  const lp = useLivePrice(row.id, row.live);
  const price = displayPrice(row, lp);
  return (
    <Link href={assetPath(row.id)} className="tile asset-tile">
      <span className="tile-head">
        <CoinLogo src={row.image} symbol={row.symbol} size={22} />
        <strong>{row.symbol}</strong>
        <span className="muted small">{row.name}</span>
      </span>
      <span className="tile-price num">{formatAssetPrice(row.id, price)}</span>
      <Change value={pctChange(price, row.ref24h)} />
      <Sparkline points={row.sparkline} width={160} height={40} />
    </Link>
  );
}

/** Price tiles with a 7-day line, for the dashboard. */
export function AssetTiles({ rows }: { rows: AssetRow[] }) {
  return (
    <div className="asset-tiles">
      {rows.map((r) => (
        <Tile key={r.id} row={r} />
      ))}
    </div>
  );
}

/** A dense price list for side columns. */
export function MiniMarket({ rows }: { rows: AssetRow[] }) {
  return (
    <ul className="mini-market">
      {rows.map((r) => (
        <MiniRow key={r.id} row={r} />
      ))}
    </ul>
  );
}

function MiniRow({ row }: { row: AssetRow }) {
  const lp = useLivePrice(row.id, row.live);
  const price = displayPrice(row, lp);
  return (
    <li>
      <Link href={assetPath(row.id)}>
        <CoinLogo src={row.image} symbol={row.symbol} size={18} />
        <span className="sym">{row.symbol}</span>
        <span className="num">{formatAssetPrice(row.id, price)}</span>
        <Change value={pctChange(price, row.ref24h)} />
      </Link>
    </li>
  );
}
