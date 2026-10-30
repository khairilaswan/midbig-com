import type WebSocket from "ws";
import { forexStatus, usStockStatus } from "@midbig/shared";
import type { MarketState } from "../market.js";
import { logger } from "../log.js";
import { Feed } from "./feed.js";

const log = logger("finnhub");

/** GET /quote: last price and the day so far. */
export interface FinnhubQuote {
  /** Current (last) price. */
  c: number;
  /** Change and % change from the previous close. */
  d: number | null;
  dp: number | null;
  h: number;
  l: number;
  o: number;
  /** Previous close. */
  pc: number;
  /** Time of the quote, unix seconds. */
  t: number;
}

/** GET /stock/profile2. Market cap and shares are in millions. */
export interface FinnhubProfile {
  name?: string;
  ticker?: string;
  exchange?: string;
  logo?: string;
  weburl?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number;
  shareOutstanding?: number;
}

/** GET /stock/metric?metric=all, the fields we keep. Volumes are in millions of shares. */
export interface FinnhubMetrics {
  metric?: {
    "52WeekHigh"?: number;
    "52WeekLow"?: number;
    peTTM?: number;
    peBasicExclExtraTTM?: number;
    beta?: number;
    dividendYieldIndicatedAnnual?: number;
    currentDividendYieldTTM?: number;
    "10DayAverageTradingVolume"?: number;
  };
}

/** GET /stock/candle and /forex/candle. */
export interface FinnhubCandles {
  s: "ok" | "no_data";
  t?: number[];
  c?: number[];
  v?: number[];
}

/** Thrown when the plan doesn't include an endpoint (401/403). */
export class FinnhubPlanError extends Error {}

/**
 * Finnhub REST client. Calls run one at a time, spaced to stay under the
 * plan's per-minute limit (60 on the free plan).
 */
export class FinnhubClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  private readonly gapMs: number;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    callsPerMinute: number,
  ) {
    this.gapMs = Math.ceil(60_000 / Math.max(1, callsPerMinute));
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const run = async (): Promise<T> => {
      for (let attempt = 1; ; attempt++) {
        const wait = this.lastCall + this.gapMs - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        this.lastCall = Date.now();
        const q = new URLSearchParams(params);
        const res = await fetch(`${this.baseUrl}${path}?${q}`, {
          headers: { accept: "application/json", "X-Finnhub-Token": this.apiKey },
          signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) return (await res.json()) as T;
        if (res.status === 401 || res.status === 403) {
          throw new FinnhubPlanError(`Finnhub ${res.status} for ${path}: ${(await res.text()).slice(0, 200)}`);
        }
        if (res.status === 429 && attempt < 4) {
          log.warn(`rate limited on ${path}, retrying in ${10 * attempt}s`);
          await new Promise((r) => setTimeout(r, 10_000 * attempt));
          continue;
        }
        throw new Error(`Finnhub ${res.status} for ${path}: ${(await res.text()).slice(0, 200)}`);
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  quote(symbol: string): Promise<FinnhubQuote> {
    return this.get("/quote", { symbol });
  }

  profile(symbol: string): Promise<FinnhubProfile> {
    return this.get("/stock/profile2", { symbol });
  }

  metrics(symbol: string): Promise<FinnhubMetrics> {
    return this.get("/stock/metric", { symbol, metric: "all" });
  }

  /** Units of each currency per 1 `base`, e.g. { EUR: 0.92, JPY: 151.2 } for USD. */
  async forexRates(base: string): Promise<Record<string, number>> {
    const res = await this.get<{ quote?: Record<string, number> }>("/forex/rates", { base });
    return res.quote ?? {};
  }

  stockCandles(symbol: string, fromSec: number, toSec: number): Promise<FinnhubCandles> {
    return this.get("/stock/candle", { symbol, resolution: "D", from: String(fromSec), to: String(toSec) });
  }

  forexCandles(symbol: string, fromSec: number, toSec: number): Promise<FinnhubCandles> {
    return this.get("/forex/candle", { symbol, resolution: "D", from: String(fromSec), to: String(toSec) });
  }
}

/** Finnhub's streaming symbol for a forex pair: OANDA:EUR_USD. */
export function finnhubForexSymbol(base: string, quote: string): string {
  return `OANDA:${base}_${quote}`;
}

/** Rate for base/quote from rates against USD (USD itself is 1). */
export function crossRate(usdRates: Record<string, number>, base: string, quote: string): number | null {
  const per = (c: string) => (c === "USD" ? 1 : usdRates[c]);
  const b = per(base);
  const q = per(quote);
  return b && q && b > 0 && q > 0 ? q / b : null;
}

export type FinnhubEvent =
  | { kind: "trades"; trades: { symbol: string; price: number; size: number; ts: number }[] }
  | { kind: "error"; message: string }
  | { kind: "other" };

export function parseFinnhubMessage(msg: unknown): FinnhubEvent {
  if (typeof msg !== "object" || msg === null) return { kind: "other" };
  const m = msg as Record<string, unknown>;
  if (m.type === "trade" && Array.isArray(m.data)) {
    const trades = [];
    for (const t of m.data as Record<string, unknown>[]) {
      const price = Number(t.p);
      const ts = Number(t.t);
      if (typeof t.s !== "string" || !(price > 0) || !(ts > 0)) continue;
      trades.push({ symbol: t.s, price, size: Number(t.v) || 0, ts });
    }
    return { kind: "trades", trades };
  }
  if (m.type === "error") return { kind: "error", message: String(m.msg ?? "") };
  return { kind: "other" };
}

/**
 * Finnhub's trade stream for US stocks and OANDA forex. One connection
 * carries every symbol; the plan limits how many (50 on the free plan), so
 * the caller decides which ones go on it.
 */
export class FinnhubFeed extends Feed {
  private subscribed = new Map<string, string>();

  constructor(url: string, state: MarketState, symbols: () => Map<string, string>) {
    super("finnhub", url, state, symbols);
  }

  /** Both markets closed (weekends, nights) means silence is normal. */
  override expectsTraffic(): boolean {
    const now = Date.now();
    return usStockStatus(now).phase !== "closed" || forexStatus(now).phase !== "closed";
  }

  protected async onOpen(ws: WebSocket): Promise<void> {
    this.subscribed = new Map(this.symbols());
    this.state.clearCoverage(this.name);
    for (const assetId of this.subscribed.values()) this.state.addCoverage(this.name, assetId);
    this.log.info(`subscribing to ${this.subscribed.size} stock and forex symbols`);
    for (const symbol of this.subscribed.keys()) this.send(ws, { type: "subscribe", symbol });
  }

  protected onMessage(msg: unknown): void {
    const ev = parseFinnhubMessage(msg);
    if (ev.kind === "trades") {
      for (const t of ev.trades) {
        const assetId = this.subscribed.get(t.symbol);
        if (assetId) this.state.trade({ assetId, source: this.name, price: t.price, size: t.size, ts: t.ts });
      }
    } else if (ev.kind === "error") {
      this.log.warn(`feed error: ${ev.message}`);
    }
  }
}
