import { Redis } from "ioredis";
import { MAX_PRICE_AGE_MS, isFresh } from "@midbig/shared";
import { startAlertChecker } from "./alerts.js";
import { config } from "./config.js";
import { CoinGeckoClient } from "./coingecko.js";
import { createPool, migrate } from "./db.js";
import { startGateway } from "./gateway.js";
import { logger } from "./log.js";
import { MarketState } from "./market.js";
import { backfillHistory, buildSymbolMap, loadTrackedAssets, syncMarkets } from "./metadata.js";
import { startCandleWriter, startPublisher } from "./publisher.js";
import { CoinbaseFeed } from "./sources/coinbase.js";
import type { Feed } from "./sources/feed.js";
import { KrakenFeed } from "./sources/kraken.js";

const log = logger("main");

async function main(): Promise<void> {
  const pool = createPool(config.databaseUrl);
  await retry("database", () => migrate(pool, config.migrationsDir));
  const redis = new Redis(config.redisUrl);

  const cg = new CoinGeckoClient(config.coingecko.baseUrl, config.coingecko.apiKey, config.coingecko.minGapMs);
  let tracked = await loadTrackedAssets(pool);
  let lastSync = 0;
  const sync = async () => {
    const n = await syncMarkets(pool, cg, config.coingecko.topN);
    lastSync = Date.now();
    tracked = await loadTrackedAssets(pool);
    log.info(`market data synced for ${n} assets`);
  };
  // First boot has no assets yet, and the feeds need them to know what to subscribe to.
  if (tracked.length === 0) await retry("first market data sync", sync);

  let symbols = buildSymbolMap(tracked);
  const state = new MarketState();
  const feeds: Feed[] = [];
  if (config.coinbase.enabled) {
    feeds.push(new CoinbaseFeed(config.coinbase.wsUrl, config.coinbase.restUrl, state, () => symbols));
  }
  if (config.kraken.enabled) feeds.push(new KrakenFeed(config.kraken.wsUrl, state, () => symbols));
  for (const f of feeds) f.start();

  const stopPublisher = startPublisher(state, redis);
  const stopCandles = startCandleWriter(state, pool);
  const stopAlerts = startAlertChecker(state, pool, config.alerts);

  const stopGateway = await startGateway({
    port: config.port,
    redisUrl: config.redisUrl,
    health: () => {
      const now = Date.now();
      const sources = state.sourcesStatus(now);
      const prices = state.all();
      const feedsOk = feeds.every((f) => {
        const ago = sources[f.name]?.lastMessageAgoMs;
        return ago != null && ago <= MAX_PRICE_AGE_MS;
      });
      return {
        ok: feedsOk,
        sources,
        trackedAssets: tracked.length,
        assetsWithExchangePrice: prices.length,
        assetsLive: prices.filter((p) => isFresh(p.asOf, now)).length,
        metadataSyncedAgoMs: lastSync ? now - lastSync : null,
      };
    },
  });

  // Refresh market caps, ranks and logos; resubscribe when the coin list changes.
  const refresh = () =>
    sync()
      .then(() => {
        const next = buildSymbolMap(tracked);
        if (sameMap(next, symbols)) return;
        symbols = next;
        log.info("tracked coins changed, resubscribing feeds");
        for (const f of feeds) f.restart();
      })
      .catch((err) => log.error("market data sync failed", err));
  const syncTimer = setInterval(refresh, config.coingecko.syncMinutes * 60_000);
  if (lastSync === 0) setTimeout(refresh, 5_000);

  // One-off history backfill for new coins, checked daily.
  const runBackfill = () =>
    backfillHistory(pool, cg, config.coingecko.backfillDays).catch((err) => log.error("backfill failed", err));
  setTimeout(runBackfill, 30_000);
  const backfillTimer = setInterval(runBackfill, 24 * 3600_000);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal} received, shutting down`);
    clearInterval(syncTimer);
    clearInterval(backfillTimer);
    for (const f of feeds) f.stop();
    stopPublisher();
    await stopAlerts();
    await stopCandles();
    await stopGateway();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

function sameMap(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

async function retry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = Math.min(60, 2 ** attempt);
      log.warn(`${what} failed (attempt ${attempt}), retrying in ${delay}s`, err);
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
  }
}

main().catch((err) => {
  log.error("fatal", err);
  process.exit(1);
});
