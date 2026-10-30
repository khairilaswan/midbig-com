import { logger } from "./log.js";

const log = logger("coingecko");

/** One row of GET /coins/markets. Only the fields we store. */
export interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price: number[] } | null;
}

export interface MarketChart {
  prices: [number, number][];
  total_volumes: [number, number][];
  market_caps: [number, number][];
}

export class CoinGeckoClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly minGapMs: number,
  ) {}

  /** Calls run one at a time with at least minGapMs between them. */
  private get<T>(pathAndQuery: string): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastCall + this.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      for (let attempt = 1; ; attempt++) {
        this.lastCall = Date.now();
        const headers: Record<string, string> = { accept: "application/json" };
        if (this.apiKey) headers["x-cg-demo-api-key"] = this.apiKey;
        const res = await fetch(this.baseUrl + pathAndQuery, { headers, signal: AbortSignal.timeout(20_000) });
        if (res.ok) return (await res.json()) as T;
        // 429: back off and retry a few times; anything else is a hard failure.
        if (res.status === 429 && attempt < 4) {
          const backoff = 15_000 * attempt;
          log.warn(`rate limited on ${pathAndQuery}, retrying in ${backoff / 1000}s`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`CoinGecko ${res.status} for ${pathAndQuery}: ${(await res.text()).slice(0, 200)}`);
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  markets(page: number, perPage = 250): Promise<CoinMarket[]> {
    const q = new URLSearchParams({
      vs_currency: "usd",
      order: "market_cap_desc",
      per_page: String(perPage),
      page: String(page),
      sparkline: "true",
      price_change_percentage: "24h,7d",
    });
    return this.get<CoinMarket[]>(`/coins/markets?${q}`);
  }

  marketChart(id: string, days: number): Promise<MarketChart> {
    const q = new URLSearchParams({ vs_currency: "usd", days: String(days), interval: "daily" });
    return this.get<MarketChart>(`/coins/${encodeURIComponent(id)}/market_chart?${q}`);
  }
}
