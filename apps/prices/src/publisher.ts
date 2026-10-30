import type { Redis } from "ioredis";
import type pg from "pg";
import { PRICES_KEY, TICKS_CHANNEL, type LivePrice } from "@midbig/shared";
import type { Candle, MarketState } from "./market.js";
import { logger } from "./log.js";

const log = logger("publisher");

/** Interval between full refreshes, which carry updated asOf times for quiet markets. */
const FULL_REFRESH_EVERY = 5;

/**
 * Once a second, writes changed prices to Redis and publishes them on the
 * ticks channel. Every few seconds it sends every price, so a market with no
 * trades still shows that its price was confirmed recently.
 */
export function startPublisher(state: MarketState, redis: Redis): () => void {
  let n = 0;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const dirty = state.takeDirty();
      const batch = ++n % FULL_REFRESH_EVERY === 0 ? state.all() : dirty;
      if (batch.length > 0) await publish(redis, batch);
    } catch (err) {
      log.error("publish failed", err);
    } finally {
      busy = false;
    }
  }, 1000);
  return () => clearInterval(timer);
}

async function publish(redis: Redis, batch: LivePrice[]): Promise<void> {
  const fields: string[] = [];
  for (const lp of batch) fields.push(lp.id, JSON.stringify(lp));
  await redis
    .pipeline()
    .hset(PRICES_KEY, ...fields)
    .publish(TICKS_CHANNEL, JSON.stringify({ now: Date.now(), data: batch }))
    .exec();
}

/** Every 10 seconds, upserts closed and forming 1-minute candles. */
export function startCandleWriter(state: MarketState, pool: pg.Pool): () => Promise<void> {
  let busy: Promise<void> | null = null;
  const flush = async () => {
    const candles = state.candles.drain();
    if (candles.length > 0) await writeCandles(pool, candles);
  };
  const timer = setInterval(() => {
    if (busy) return;
    busy = flush()
      .catch((err) => log.error("candle write failed", err))
      .finally(() => (busy = null));
  }, 10_000);
  return async () => {
    clearInterval(timer);
    await busy;
    await flush().catch((err) => log.error("final candle write failed", err));
  };
}

export async function writeCandles(pool: pg.Pool, candles: Candle[]): Promise<void> {
  await pool.query(
    `INSERT INTO candles_1m (asset_id, ts, open, high, low, close, volume, trades)
     SELECT asset_id, to_timestamp(ts / 1000.0), open, high, low, close, volume, trades
     FROM jsonb_to_recordset($1::jsonb) AS x(asset_id text, ts bigint, open float8, high float8,
       low float8, close float8, volume float8, trades int)
     ON CONFLICT (asset_id, ts) DO UPDATE SET
       open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close,
       volume = EXCLUDED.volume, trades = EXCLUDED.trades`,
    [
      JSON.stringify(
        candles.map((c) => ({
          asset_id: c.assetId,
          ts: c.ts,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          trades: c.trades,
        })),
      ),
    ],
  );
}
