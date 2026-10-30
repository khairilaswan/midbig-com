import "server-only";
import { Redis } from "ioredis";
import pg from "pg";
import { PRICES_KEY, type LivePrice } from "@midbig/shared";
import type { AssetDetail, AssetRow } from "./types";

// Reuse connections across hot reloads in dev and across requests in prod.
const g = globalThis as unknown as { __pool?: pg.Pool; __redis?: Redis };

function pool(): pg.Pool {
  g.__pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://midbig:midbig@localhost:5432/midbig",
    max: 10,
  });
  return g.__pool;
}

function redis(): Redis {
  g.__redis ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
  });
  return g.__redis;
}

export const PAGE_SIZE = 100;

/** Tiny in-process cache so crawler bursts don't turn into one query per hit. */
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 2000) cache.clear();
  return value;
}

async function livePrices(ids: string[]): Promise<Map<string, LivePrice>> {
  const out = new Map<string, LivePrice>();
  if (ids.length === 0) return out;
  try {
    const values = await redis().hmget(PRICES_KEY, ...ids);
    values.forEach((v) => {
      if (!v) return;
      const lp = JSON.parse(v) as LivePrice;
      out.set(lp.id, lp);
    });
  } catch (err) {
    // Redis down: pages still render with the fallback price, marked delayed.
    console.error("redis read failed", err);
  }
  return out;
}

const ROW_COLUMNS = `id, symbol, name, image_url, market_cap_rank, market_cap, total_volume, circulating_supply,
  ref_price, price_change_pct_24h, price_change_pct_7d, sparkline_7d, metadata_updated_at`;

interface RowRecord {
  id: string;
  symbol: string;
  name: string;
  image_url: string | null;
  market_cap_rank: number | null;
  market_cap: number | null;
  total_volume: number | null;
  circulating_supply: number | null;
  ref_price: number | null;
  price_change_pct_24h: number | null;
  price_change_pct_7d: number | null;
  sparkline_7d: number[] | null;
  metadata_updated_at: Date | null;
}

/** Reference price N ago, derived from the provider's price and % change at sync time. */
function refFromPct(price: number | null, pct: number | null): number | null {
  if (price == null || pct == null || pct <= -100) return null;
  return price / (1 + pct / 100);
}

function toRow(r: RowRecord, live: LivePrice | undefined): AssetRow {
  return {
    id: r.id,
    symbol: r.symbol.toUpperCase(),
    name: r.name,
    image: r.image_url,
    rank: r.market_cap_rank,
    marketCap: r.market_cap,
    volume24h: r.total_volume,
    circulatingSupply: r.circulating_supply,
    refPrice: r.ref_price,
    ref24h: refFromPct(r.ref_price, r.price_change_pct_24h),
    ref7d: refFromPct(r.ref_price, r.price_change_pct_7d),
    sparkline: r.sparkline_7d ?? [],
    metadataAt: r.metadata_updated_at ? r.metadata_updated_at.getTime() : null,
    live: live ?? null,
  };
}

export async function getMarketPage(page: number): Promise<{ rows: AssetRow[]; total: number }> {
  const base = await cached(`market:${page}`, 15_000, async () => {
    const [rows, count] = await Promise.all([
      pool().query<RowRecord>(
        `SELECT ${ROW_COLUMNS} FROM assets
         WHERE asset_class = 'crypto' AND market_cap_rank IS NOT NULL
         ORDER BY market_cap_rank LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, (page - 1) * PAGE_SIZE],
      ),
      pool().query<{ n: number }>(
        `SELECT count(*)::int AS n FROM assets WHERE asset_class = 'crypto' AND market_cap_rank IS NOT NULL`,
      ),
    ]);
    return { rows: rows.rows, total: count.rows[0]?.n ?? 0 };
  });
  const live = await livePrices(base.rows.map((r) => r.id));
  return { rows: base.rows.map((r) => toRow(r, live.get(r.id))), total: base.total };
}

/**
 * Biggest 24h movers among ranked coins with real trading volume. Sorted by
 * the provider's 24h change at the last sync; live prices update the figures.
 */
export async function getMovers(limit: number): Promise<{ gainers: AssetRow[]; losers: AssetRow[] }> {
  const base = await cached(`movers:${limit}`, 60_000, async () => {
    const q = (dir: "DESC" | "ASC") =>
      pool().query<RowRecord>(
        `SELECT ${ROW_COLUMNS} FROM assets
         WHERE asset_class = 'crypto' AND market_cap_rank IS NOT NULL
           AND total_volume >= 50000 AND price_change_pct_24h IS NOT NULL
         ORDER BY price_change_pct_24h ${dir} LIMIT $1`,
        [limit],
      );
    const [g, l] = await Promise.all([q("DESC"), q("ASC")]);
    return { gainers: g.rows, losers: l.rows };
  });
  const live = await livePrices([...base.gainers, ...base.losers].map((r) => r.id));
  return {
    gainers: base.gainers.map((r) => toRow(r, live.get(r.id))),
    losers: base.losers.map((r) => toRow(r, live.get(r.id))),
  };
}

export async function getAsset(id: string): Promise<AssetDetail | null> {
  const r = await cached(`asset:${id}`, 15_000, async () => {
    const res = await pool().query<
      RowRecord & {
        fully_diluted_valuation: number | null;
        total_supply: number | null;
        max_supply: number | null;
        ath: number | null;
        ath_date: Date | null;
        atl: number | null;
        atl_date: Date | null;
      }
    >(
      `SELECT ${ROW_COLUMNS}, fully_diluted_valuation, total_supply, max_supply, ath, ath_date, atl, atl_date
       FROM assets WHERE id = $1`,
      [id],
    );
    return res.rows[0] ?? null;
  });
  if (!r) return null;
  const live = await livePrices([id]);
  return {
    ...toRow(r, live.get(id)),
    fdv: r.fully_diluted_valuation,
    totalSupply: r.total_supply,
    maxSupply: r.max_supply,
    ath: r.ath,
    athDate: r.ath_date ? r.ath_date.getTime() : null,
    atl: r.atl,
    atlDate: r.atl_date ? r.atl_date.getTime() : null,
  };
}

export async function getAllAssetIds(): Promise<{ id: string; updatedAt: Date | null }[]> {
  const res = await pool().query<{ id: string; metadata_updated_at: Date | null }>(
    `SELECT id, metadata_updated_at FROM assets WHERE asset_class = 'crypto' ORDER BY market_cap_rank NULLS LAST`,
  );
  return res.rows.map((r) => ({ id: r.id, updatedAt: r.metadata_updated_at }));
}

export async function searchAssets(q: string) {
  const term = q.trim().slice(0, 50);
  if (!term) return [];
  const like = term.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const res = await pool().query<{ id: string; symbol: string; name: string; image_url: string | null; market_cap_rank: number | null }>(
    `SELECT id, symbol, name, image_url, market_cap_rank FROM assets
     WHERE symbol ILIKE $1 OR name ILIKE $1 OR name ILIKE '% ' || $1
     ORDER BY lower(symbol) = lower($2) DESC, market_cap_rank NULLS LAST
     LIMIT 8`,
    [like, term],
  );
  return res.rows.map((r) => ({
    id: r.id,
    symbol: r.symbol.toUpperCase(),
    name: r.name,
    image: r.image_url,
    rank: r.market_cap_rank,
  }));
}

export type ChartRange = "1d" | "7d" | "30d" | "1y";

/**
 * Close prices for a chart, as [unix seconds, price]. Uses our own candles
 * where we have them and the backfilled daily history before that.
 */
export async function getChart(id: string, range: ChartRange): Promise<[number, number][]> {
  const spec = {
    "1d": { view: "candles_1m", interval: "1 day" },
    "7d": { view: "candles_1h", interval: "7 days" },
    "30d": { view: "candles_1h", interval: "30 days" },
    "1y": { view: "candles_1d", interval: "365 days" },
  }[range];
  // Daily history points are too coarse for the 24h view.
  const historyFrom = range === "1d" ? "'infinity'::date" : "(now() - $2::interval)::date";
  return cached(`chart:${id}:${range}`, range === "1d" ? 20_000 : 120_000, async () => {
    const res = await pool().query<{ t: number; close: number }>(
      `WITH own AS (
         SELECT ts, close FROM ${spec.view}
         WHERE asset_id = $1 AND ts >= now() - $2::interval
       ), first_own AS (SELECT min(ts) AS m FROM own)
       SELECT extract(epoch FROM h.day::timestamptz)::bigint AS t, h.close
       FROM history_daily h, first_own
       WHERE h.asset_id = $1 AND h.day >= ${historyFrom}
         AND (first_own.m IS NULL OR h.day::timestamptz < first_own.m)
       UNION ALL
       SELECT extract(epoch FROM ts)::bigint, close FROM own
       ORDER BY 1`,
      [id, spec.interval],
    );
    return res.rows.map((r) => [Number(r.t), r.close] as [number, number]);
  });
}
