/**
 * Asset classes beyond crypto: how their ids and URLs look, the forex pairs
 * we list, and when US stock and forex markets are open. Pure, so the price
 * service, the server and the browser all agree on "market closed".
 */

export type AssetClass = "crypto" | "stock" | "forex";

/** Asset ids: CoinGecko ids for crypto, "stock-aapl" and "fx-eur-usd" for the rest. */
const STOCK_PREFIX = "stock-";
const FX_PREFIX = "fx-";

export function assetClassOf(id: string): AssetClass {
  if (id.startsWith(STOCK_PREFIX)) return "stock";
  if (id.startsWith(FX_PREFIX)) return "forex";
  return "crypto";
}

/** "BRK.B" -> "stock-brk-b". */
export function stockId(ticker: string): string {
  return STOCK_PREFIX + ticker.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** ("EUR", "USD") -> "fx-eur-usd". */
export function forexId(base: string, quote: string): string {
  return `${FX_PREFIX}${base.toLowerCase()}-${quote.toLowerCase()}`;
}

/** Page for an asset: /coins/bitcoin, /stocks/aapl, /forex/eur-usd. */
export function assetPath(id: string): string {
  if (id.startsWith(STOCK_PREFIX)) return `/stocks/${id.slice(STOCK_PREFIX.length)}`;
  if (id.startsWith(FX_PREFIX)) return `/forex/${id.slice(FX_PREFIX.length)}`;
  return `/coins/${id}`;
}

/** Inverse of assetPath's slug, for the stock and forex routes. */
export function idFromSlug(cls: "stock" | "forex", slug: string): string {
  return (cls === "stock" ? STOCK_PREFIX : FX_PREFIX) + slug.toLowerCase();
}

/**
 * Forex pairs we list: the majors, the busiest crosses and the dollar against
 * big emerging-market currencies. Each needs to be quoted by OANDA, which is
 * the forex source Finnhub streams.
 */
export const FOREX_PAIRS: { base: string; quote: string }[] = [
  ["EUR", "USD"], ["USD", "JPY"], ["GBP", "USD"], ["USD", "CHF"], ["AUD", "USD"], ["USD", "CAD"],
  ["NZD", "USD"], ["EUR", "GBP"], ["EUR", "JPY"], ["GBP", "JPY"], ["EUR", "CHF"], ["AUD", "JPY"],
  ["EUR", "AUD"], ["EUR", "CAD"], ["GBP", "CHF"], ["CAD", "JPY"], ["CHF", "JPY"], ["AUD", "NZD"],
  ["NZD", "JPY"], ["GBP", "AUD"], ["USD", "MXN"], ["USD", "CNH"], ["USD", "HKD"], ["USD", "SGD"],
  ["USD", "ZAR"], ["USD", "TRY"], ["USD", "SEK"], ["USD", "NOK"], ["USD", "PLN"], ["USD", "THB"],
].map(([base, quote]) => ({ base: base!, quote: quote! }));

export const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar", EUR: "Euro", JPY: "Japanese Yen", GBP: "British Pound", CHF: "Swiss Franc",
  AUD: "Australian Dollar", CAD: "Canadian Dollar", NZD: "New Zealand Dollar", MXN: "Mexican Peso",
  CNH: "Chinese Yuan (offshore)", HKD: "Hong Kong Dollar", SGD: "Singapore Dollar", ZAR: "South African Rand",
  TRY: "Turkish Lira", SEK: "Swedish Krona", NOK: "Norwegian Krone", PLN: "Polish Zloty", THB: "Thai Baht",
};

/** Decimal places traders expect for a rate: 3 for yen-style quotes, 5 otherwise. */
export function forexDecimals(rate: number): number {
  return Math.abs(rate) >= 20 ? 3 : 5;
}

// ---------------------------------------------------------------------------
// Market hours

export type MarketPhase = "open" | "pre" | "after" | "closed";

export interface MarketStatus {
  phase: MarketPhase;
  /** Short label for the page, e.g. "Market closed". */
  label: string;
}

/**
 * NYSE and Nasdaq full-day holidays. Update this list each December from
 * https://www.nyse.com/markets/hours-calendars; dates past it count as
 * normal weekdays.
 */
export const US_MARKET_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** Days the stock market closes at 1:00 pm New York time. */
export const US_MARKET_EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

const nyFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Date, weekday (0 = Sunday) and minutes since midnight in New York. */
export function newYorkTime(ms: number): { date: string; weekday: number; minutes: number } {
  const parts: Record<string, string> = {};
  for (const p of nyFormat.formatToParts(new Date(ms))) parts[p.type] = p.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday!);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * US stock market session: regular hours 9:30 am to 4:00 pm New York time on
 * trading days, with pre-market from 4:00 am and after-hours to 8:00 pm.
 */
export function usStockStatus(ms: number): MarketStatus {
  const { date, weekday, minutes } = newYorkTime(ms);
  if (weekday === 0 || weekday === 6 || US_MARKET_HOLIDAYS.has(date)) return { phase: "closed", label: "Market closed" };
  const close = US_MARKET_EARLY_CLOSES.has(date) ? 13 * 60 : 16 * 60;
  if (minutes >= 9 * 60 + 30 && minutes < close) return { phase: "open", label: "Market open" };
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return { phase: "pre", label: "Pre-market" };
  if (minutes >= close && minutes < 20 * 60) return { phase: "after", label: "After hours" };
  return { phase: "closed", label: "Market closed" };
}

/** Forex trades around the clock from Sunday 5:00 pm to Friday 5:00 pm New York time. */
export function forexStatus(ms: number): MarketStatus {
  const { weekday, minutes } = newYorkTime(ms);
  const closed =
    weekday === 6 || (weekday === 5 && minutes >= 17 * 60) || (weekday === 0 && minutes < 17 * 60);
  return closed ? { phase: "closed", label: "Market closed" } : { phase: "open", label: "Market open" };
}

/** Status for any asset; crypto never closes. */
export function marketStatus(id: string, ms: number): MarketStatus {
  const cls = assetClassOf(id);
  if (cls === "stock") return usStockStatus(ms);
  if (cls === "forex") return forexStatus(ms);
  return { phase: "open", label: "Market open" };
}

/**
 * Whether the 1-minute freshness rule applies right now. Outside regular
 * hours a stock's last trade is its price, so it isn't "delayed".
 */
export function expectsLivePrice(id: string, ms: number): boolean {
  return marketStatus(id, ms).phase === "open";
}
