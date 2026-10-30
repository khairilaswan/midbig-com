function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`Missing environment variable ${name}`);
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return n;
}

export const config = {
  databaseUrl: env("DATABASE_URL", "postgres://midbig:midbig@localhost:5432/midbig"),
  redisUrl: env("REDIS_URL", "redis://localhost:6379"),
  port: envInt("PORT", 8080),
  migrationsDir: env("MIGRATIONS_DIR", new URL("../../../db/migrations", import.meta.url).pathname),

  coingecko: {
    baseUrl: env("COINGECKO_BASE_URL", "https://api.coingecko.com/api/v3"),
    /** Demo (free) plan key. Optional, but the keyless public API is rate limited harder. */
    apiKey: process.env.COINGECKO_API_KEY ?? "",
    /** How many assets to track, ranked by market cap (250 per API call). */
    topN: envInt("COINGECKO_TOP_N", 500),
    /**
     * Minutes between market data refreshes. 2 calls every 15 minutes is about
     * 5,800 calls a month, which leaves room under the free plan's 10,000 for
     * the one-off history backfill.
     */
    syncMinutes: envInt("COINGECKO_SYNC_MINUTES", 15),
    /** Minimum gap between any two CoinGecko calls (free plan allows ~30/min). */
    minGapMs: envInt("COINGECKO_MIN_GAP_MS", 2500),
    /** Days of daily history to backfill per asset (the free plan allows up to 365). */
    backfillDays: envInt("COINGECKO_BACKFILL_DAYS", 365),
  },

  coinbase: {
    wsUrl: env("COINBASE_WS_URL", "wss://ws-feed.exchange.coinbase.com"),
    restUrl: env("COINBASE_REST_URL", "https://api.exchange.coinbase.com"),
    enabled: env("COINBASE_ENABLED", "true") === "true",
  },
  kraken: {
    wsUrl: env("KRAKEN_WS_URL", "wss://ws.kraken.com/v2"),
    enabled: env("KRAKEN_ENABLED", "true") === "true",
  },
};
