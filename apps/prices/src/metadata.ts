import type pg from "pg";
import type { CoinGeckoClient, CoinMarket } from "./coingecko.js";
import { logger } from "./log.js";

const log = logger("metadata");

export interface TrackedAsset {
  id: string;
  symbol: string;
  rank: number | null;
}

/**
 * Maps an upper-case ticker symbol to one asset id. Symbols are not unique
 * (many small tokens reuse "BTC"-like tickers), so the best-ranked asset wins,
 * which is the one an exchange's USD market almost always refers to.
 */
export function buildSymbolMap(assets: TrackedAsset[]): Map<string, string> {
  const best = new Map<string, TrackedAsset>();
  for (const a of assets) {
    const sym = a.symbol.toUpperCase();
    const current = best.get(sym);
    if (!current || rankOf(a) < rankOf(current)) best.set(sym, a);
  }
  return new Map([...best].map(([sym, a]) => [sym, a.id]));
}

function rankOf(a: TrackedAsset): number {
  return a.rank ?? Number.MAX_SAFE_INTEGER;
}

/** Fetches the top N coins by market cap and upserts them. */
export async function syncMarkets(pool: pg.Pool, cg: CoinGeckoClient, topN: number): Promise<number> {
  const pages = Math.ceil(topN / 250);
  const rows: CoinMarket[] = [];
  for (let page = 1; page <= pages; page++) {
    const batch = await cg.markets(page, Math.min(250, topN - (page - 1) * 250));
    rows.push(...batch);
    if (batch.length === 0) break;
  }
  if (rows.length === 0) return 0;

  // One round trip: pass the batch as JSON and let Postgres unpack it.
  const payload = rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    image_url: r.image,
    market_cap_rank: r.market_cap_rank,
    market_cap: r.market_cap,
    fully_diluted_valuation: r.fully_diluted_valuation,
    total_volume: r.total_volume,
    circulating_supply: r.circulating_supply,
    total_supply: r.total_supply,
    max_supply: r.max_supply,
    ath: r.ath,
    ath_date: r.ath_date,
    atl: r.atl,
    atl_date: r.atl_date,
    ref_price: r.current_price,
    price_change_pct_24h: r.price_change_percentage_24h_in_currency ?? null,
    price_change_pct_7d: r.price_change_percentage_7d_in_currency ?? null,
    sparkline_7d: downsample(r.sparkline_in_7d?.price ?? [], 42),
  }));
  await pool.query(
    `INSERT INTO assets (id, symbol, name, image_url, market_cap_rank, market_cap, fully_diluted_valuation,
       total_volume, circulating_supply, total_supply, max_supply, ath, ath_date, atl, atl_date,
       ref_price, price_change_pct_24h, price_change_pct_7d, sparkline_7d, metadata_updated_at)
     SELECT id, symbol, name, image_url, market_cap_rank, market_cap, fully_diluted_valuation,
       total_volume, circulating_supply, total_supply, max_supply, ath, ath_date, atl, atl_date,
       ref_price, price_change_pct_24h, price_change_pct_7d, sparkline_7d, now()
     FROM jsonb_to_recordset($1::jsonb) AS x(
       id text, symbol text, name text, image_url text, market_cap_rank int, market_cap float8,
       fully_diluted_valuation float8, total_volume float8, circulating_supply float8, total_supply float8,
       max_supply float8, ath float8, ath_date timestamptz, atl float8, atl_date timestamptz,
       ref_price float8, price_change_pct_24h float8, price_change_pct_7d float8, sparkline_7d real[])
     ON CONFLICT (id) DO UPDATE SET
       symbol = EXCLUDED.symbol, name = EXCLUDED.name, image_url = EXCLUDED.image_url,
       market_cap_rank = EXCLUDED.market_cap_rank, market_cap = EXCLUDED.market_cap,
       fully_diluted_valuation = EXCLUDED.fully_diluted_valuation, total_volume = EXCLUDED.total_volume,
       circulating_supply = EXCLUDED.circulating_supply, total_supply = EXCLUDED.total_supply,
       max_supply = EXCLUDED.max_supply, ath = EXCLUDED.ath, ath_date = EXCLUDED.ath_date,
       atl = EXCLUDED.atl, atl_date = EXCLUDED.atl_date, ref_price = EXCLUDED.ref_price,
       price_change_pct_24h = EXCLUDED.price_change_pct_24h, price_change_pct_7d = EXCLUDED.price_change_pct_7d,
       sparkline_7d = EXCLUDED.sparkline_7d, metadata_updated_at = now()`,
    [JSON.stringify(payload)],
  );
  // Coins that fell out of the top N keep their page but lose their rank, so
  // they drop off the ranked lists.
  await pool.query(
    `UPDATE assets SET market_cap_rank = NULL
     WHERE asset_class = 'crypto' AND market_cap_rank IS NOT NULL AND NOT (id = ANY($1::text[]))`,
    [rows.map((r) => r.id)],
  );
  return rows.length;
}

export async function loadTrackedAssets(pool: pg.Pool): Promise<TrackedAsset[]> {
  const { rows } = await pool.query<{ id: string; symbol: string; market_cap_rank: number | null }>(
    `SELECT id, symbol, market_cap_rank FROM assets
     WHERE asset_class = 'crypto' AND market_cap_rank IS NOT NULL`,
  );
  return rows.map((r) => ({ id: r.id, symbol: r.symbol, rank: r.market_cap_rank }));
}

/** Evenly picks at most n points, always keeping the last one. */
export function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const out: number[] = [];
  const step = (values.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(values[Math.round(i * step)]!);
  return out;
}

/**
 * Backfills a year of daily closes for assets that have none yet. Runs slowly
 * in the background; each asset costs one CoinGecko call, once.
 */
export async function backfillHistory(pool: pg.Pool, cg: CoinGeckoClient, days: number): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT a.id FROM assets a
     WHERE a.asset_class = 'crypto' AND a.market_cap_rank IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM history_daily h WHERE h.asset_id = a.id)
     ORDER BY a.market_cap_rank`,
  );
  if (rows.length === 0) return;
  log.info(`backfilling daily history for ${rows.length} assets`);
  let done = 0;
  for (const { id } of rows) {
    try {
      const chart = await cg.marketChart(id, days);
      const byDay = new Map<string, { close: number; volume: number | null; market_cap: number | null }>();
      const vol = new Map(chart.total_volumes.map(([t, v]) => [dayOf(t), v]));
      const cap = new Map(chart.market_caps.map(([t, v]) => [dayOf(t), v]));
      // The last point is "now", not a daily close; the live feed covers today.
      const today = dayOf(Date.now());
      for (const [t, price] of chart.prices) {
        const day = dayOf(t);
        if (day === today) continue;
        byDay.set(day, { close: price, volume: vol.get(day) ?? null, market_cap: cap.get(day) ?? null });
      }
      if (byDay.size === 0) continue; // too new to have history; retried on the next run
      await pool.query(
        `INSERT INTO history_daily (asset_id, day, close, volume, market_cap)
         SELECT $1, day, close, volume, market_cap
         FROM jsonb_to_recordset($2::jsonb) AS x(day date, close float8, volume float8, market_cap float8)
         ON CONFLICT (asset_id, day) DO NOTHING`,
        [id, JSON.stringify([...byDay].map(([day, v]) => ({ day, ...v })))],
      );
      done++;
    } catch (err) {
      log.warn(`history backfill failed for ${id}`, err);
    }
  }
  log.info(`history backfill finished: ${done}/${rows.length}`);
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
