/**
 * Types and helpers shared by the price service and the web app.
 */

import type { ChatEvent } from "./chat.js";
import { assetClassOf, forexDecimals } from "./markets.js";

/** A price is shown as live only if a feed confirmed it within this window. */
export const MAX_PRICE_AGE_MS = 60_000;

/** Redis hash holding the latest LivePrice JSON per asset id. */
export const PRICES_KEY = "prices";
/** Redis pub/sub channel carrying TickBatch JSON, about once per second. */
export const TICKS_CHANNEL = "ticks";

/** Latest known price for one asset, as stored in Redis and pushed to browsers. */
export interface LivePrice {
  /** Asset id: the CoinGecko id for crypto ("bitcoin"), "stock-aapl" or "fx-eur-usd" otherwise. */
  id: string;
  /** Last trade price in USD. */
  p: number;
  /** Time of the last trade, ms since epoch. */
  t: number;
  /**
   * Last time a connected feed confirmed this price was current (a trade, a
   * ticker update or a heartbeat for the market), ms since epoch.
   */
  asOf: number;
  /** Feeds that currently quote this asset, e.g. ["coinbase", "kraken"]. */
  src: string[];
}

/** Message sent from the price service to browsers. */
export type ServerMessage =
  | { type: "ticks"; now: number; data: LivePrice[] }
  | ChatEvent
  /** People with the room open, sent on join and when it changes. */
  | { type: "presence"; room: string; n: number }
  | { type: "error"; message: string };

/** Message sent from browsers to the price service. */
export type ClientMessage =
  | { op: "sub"; ids: string[] }
  | { op: "unsub"; ids: string[] }
  | { op: "join"; rooms: string[] }
  | { op: "leave"; rooms: string[] };

/** Most asset ids a single browser connection may subscribe to. */
export const MAX_SUBSCRIPTIONS = 300;

export function isFresh(asOf: number | null | undefined, now: number = Date.now()): boolean {
  return asOf != null && now - asOf <= MAX_PRICE_AGE_MS;
}

/** Percent change from a reference price, or null when it can't be computed. */
export function pctChange(price: number | null | undefined, ref: number | null | undefined): number | null {
  if (price == null || ref == null || ref <= 0) return null;
  return (price / ref - 1) * 100;
}

/** Decimal places that keep about 4–5 significant digits for a USD price. */
function priceDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 1000) return 2;
  if (abs >= 1) return abs >= 100 ? 2 : 4;
  if (abs === 0) return 2;
  // e.g. 0.000012345 -> enough decimals for 4 significant digits
  return Math.min(12, Math.max(4, -Math.floor(Math.log10(abs)) + 3));
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const d = priceDecimals(value);
  return (
    "$" +
    value.toLocaleString("en-US", {
      minimumFractionDigits: Math.min(d, 2),
      maximumFractionDigits: d,
    })
  );
}

/** "$1,234.56" for crypto and stocks; "1.08452" for a forex rate, which is in the quote currency. */
export function formatAssetPrice(id: string, value: number | null | undefined): string {
  if (assetClassOf(id) !== "forex") return formatUsd(value);
  if (value == null || !Number.isFinite(value)) return "—";
  const d = forexDecimals(value);
  return value.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Compact USD for large figures: $1.23T, $456.7B, $12.3M. */
export function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    "$" +
    value.toLocaleString("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    })
  );
}

export function formatNumberCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export * from "./portfolio.js";
export * from "./simulate.js";
export * from "./alerts.js";
export * from "./chat.js";
export * from "./markets.js";
export * from "./forum.js";
export * from "./stress.js";
export * from "./community.js";
export * from "./bots.js";
