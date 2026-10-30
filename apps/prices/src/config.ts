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
  alerts: {
    /** Public site address, for links in alert emails. */
    siteUrl: (process.env.SITE_URL ?? "http://localhost:8000").replace(/\/$/, ""),
    /** Resend API key for alert emails; without it alerts only go out as notifications. */
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    emailFrom: process.env.EMAIL_FROM || "midbig <alerts@midbig.com>",
    /** Optional fixed web push keys; by default the pair stored in the database is used. */
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  },

  /**
   * US stocks (S&P 500) and forex from Finnhub. Off until FINNHUB_API_KEY is
   * set. The free key is for personal use (fine on your own computer); a
   * public site needs a paid plan that allows display.
   */
  finnhub: {
    apiKey: process.env.FINNHUB_API_KEY ?? "",
    baseUrl: env("FINNHUB_BASE_URL", "https://finnhub.io/api/v1"),
    wsUrl: env("FINNHUB_WS_URL", "wss://ws.finnhub.io"),
    /** REST calls per minute; the free plan allows 60. */
    callsPerMinute: envInt("FINNHUB_CALLS_PER_MINUTE", 50),
    /** Symbols on the live trade stream; the free plan allows 50. Paid plans: set to 600. */
    wsMaxSymbols: envInt("FINNHUB_WS_SYMBOLS", 50),
    backfillDays: envInt("FINNHUB_BACKFILL_DAYS", 365),
  },

  kraken: {
    wsUrl: env("KRAKEN_WS_URL", "wss://ws.kraken.com/v2"),
    enabled: env("KRAKEN_ENABLED", "true") === "true",
  },
};
