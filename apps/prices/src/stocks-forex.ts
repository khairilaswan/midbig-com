import type pg from "pg";
import { CURRENCY_NAMES, FOREX_PAIRS, forexId, stockId } from "@midbig/shared";
import { SP500 } from "./data/sp500.js";
import { logger } from "./log.js";
import { downsample } from "./metadata.js";
import { crossRate, FinnhubPlanError, finnhubForexSymbol, type FinnhubClient, type FinnhubQuote } from "./sources/finnhub.js";

const log = logger("stocks-forex");

/** Shortest time between two passes over the stock list. */
const MIN_PASS_MS = 60_000;

export interface StockForexConfig {
  /** Most symbols on the live trade stream (the free plan allows 50). */
  wsMaxSymbols: number;
  /** Re-fetch company profile and ratios after this long. */
  profileMaxAgeHours: number;
  /** Days of daily history to backfill per asset (needs a paid plan). */
  backfillDays: number;
}

export interface FeedCandidate {
  id: string;
  symbol: string;
  assetClass: "stock" | "forex";
  rank: number | null;
}

/** Finnhub stream symbol for an asset row: "AAPL" or "OANDA:EUR_USD". */
export function streamSymbol(c: Pick<FeedCandidate, "symbol" | "assetClass">): string {
  if (c.assetClass === "stock") return c.symbol;
  const [base, quote] = c.symbol.split("/");
  return finnhubForexSymbol(base!, quote!);
}

/**
 * Which symbols go on the live stream when the plan caps them: every forex
 * pair (there are only ~30), then stocks by market cap. The rest show their
 * last quote, marked delayed.
 */
export function pickStreamSymbols(candidates: FeedCandidate[], max: number): Map<string, string> {
  const ordered = [...candidates].sort((a, b) => {
    if (a.assetClass !== b.assetClass) return a.assetClass === "forex" ? -1 : 1;
    return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
  });
  return new Map(ordered.slice(0, Math.max(0, max)).map((c) => [streamSymbol(c), c.id]));
}

/** Quote fields as stored: last price, % change from the previous close, and the day so far. */
export function quoteUpdate(q: FinnhubQuote): {
  price: number;
  pct: number | null;
  at: number;
  details: Record<string, number>;
} | null {
  // Finnhub answers unknown symbols with all zeros.
  if (!(q.c > 0)) return null;
  const pct = q.pc > 0 ? (q.c / q.pc - 1) * 100 : (q.dp ?? null);
  const details: Record<string, number> = {};
  if (q.pc > 0) details.prev_close = q.pc;
  if (q.o > 0) details.day_open = q.o;
  if (q.h > 0) details.day_high = q.h;
  if (q.l > 0) details.day_low = q.l;
  return { price: q.c, pct, at: q.t > 0 ? q.t * 1000 : Date.now(), details };
}

/** Puts every S&P 500 stock and listed forex pair in the assets table, so their pages exist at once. */
export async function seedStockForexAssets(pool: pg.Pool): Promise<void> {
  const stocks = SP500.map(([ticker, name, sector]) => ({
    id: stockId(ticker),
    asset_class: "stock",
    symbol: ticker,
    name,
    sector,
    rank: null as number | null,
  }));
  const pairs = FOREX_PAIRS.map((p, i) => ({
    id: forexId(p.base, p.quote),
    asset_class: "forex",
    symbol: `${p.base}/${p.quote}`,
    name: `${CURRENCY_NAMES[p.base] ?? p.base} to ${CURRENCY_NAMES[p.quote] ?? p.quote}`,
    sector: null as string | null,
    rank: i + 1,
  }));
  const rows = [...stocks, ...pairs];
  await pool.query(
    `INSERT INTO assets (id, asset_class, symbol, name, sector, market_cap_rank)
     SELECT id, asset_class, symbol, name, sector, rank
     FROM jsonb_to_recordset($1::jsonb) AS x(id text, asset_class text, symbol text, name text, sector text, rank int)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol, sector = EXCLUDED.sector,
       market_cap_rank = CASE WHEN assets.asset_class = 'forex' THEN EXCLUDED.market_cap_rank ELSE assets.market_cap_rank END
     WHERE assets.asset_class = EXCLUDED.asset_class`,
    [JSON.stringify(rows)],
  );
  // Stocks that left the index or pairs we dropped keep their page but leave the lists.
  await pool.query(
    `UPDATE assets SET market_cap_rank = NULL
     WHERE asset_class IN ('stock', 'forex') AND market_cap_rank IS NOT NULL AND NOT (id = ANY($1::text[]))`,
    [rows.map((r) => r.id)],
  );
  await rankStocks(pool);
}

/** Ranks the listed stocks by market cap; ones without a market cap yet go last. */
export async function rankStocks(pool: pg.Pool): Promise<void> {
  await pool.query(
    `UPDATE assets a SET market_cap_rank = r.rank
     FROM (
       SELECT id, row_number() OVER (ORDER BY market_cap DESC NULLS LAST, symbol)::int AS rank
       FROM assets WHERE asset_class = 'stock' AND id = ANY($1::text[])
     ) r
     WHERE a.id = r.id AND a.market_cap_rank IS DISTINCT FROM r.rank`,
    [SP500.map(([t]) => stockId(t))],
  );
}

export async function loadFeedCandidates(pool: pg.Pool): Promise<FeedCandidate[]> {
  const { rows } = await pool.query<{ id: string; symbol: string; asset_class: "stock" | "forex"; market_cap_rank: number | null }>(
    `SELECT id, symbol, asset_class, market_cap_rank FROM assets
     WHERE asset_class IN ('stock', 'forex') AND market_cap_rank IS NOT NULL`,
  );
  return rows.map((r) => ({ id: r.id, symbol: r.symbol, assetClass: r.asset_class, rank: r.market_cap_rank }));
}

/**
 * Keeps stock and forex data current within the plan's call budget. One
 * loop walks the S&P 500 in market cap order: a quote for each stock, plus
 * its profile and ratios once a day. With 50 calls a minute that refreshes
 * every quote about every 10 minutes; the live stream covers the rest.
 */
export class StockForexSync {
  private stopped = false;
  private timers: NodeJS.Timeout[] = [];
  private profileBlocked = false;
  private metricsBlocked = false;
  private ratesBlocked = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly client: FinnhubClient,
    private readonly cfg: StockForexConfig,
  ) {}

  start(): void {
    void this.stockLoop();
    const forex = () => this.refreshForex().catch((err) => log.error("forex refresh failed", err));
    const derived = () => this.refreshSparklines().catch((err) => log.error("sparkline refresh failed", err));
    const backfill = () => this.backfill().catch((err) => log.error("history backfill failed", err));
    setTimeout(forex, 2_000);
    setTimeout(derived, 60_000);
    setTimeout(backfill, 120_000);
    this.timers.push(
      setInterval(forex, 5 * 60_000),
      setInterval(derived, 15 * 60_000),
      setInterval(backfill, 24 * 3600_000),
      setInterval(() => rankStocks(this.pool).catch((err) => log.error("ranking failed", err)), 60_000),
    );
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
  }

  private async stockLoop(): Promise<void> {
    while (!this.stopped) {
      const { rows } = await this.pool
        .query<{ id: string; symbol: string; profile_age_h: number | null }>(
          `SELECT id, symbol, extract(epoch FROM now() - metadata_updated_at) / 3600 AS profile_age_h
           FROM assets WHERE asset_class = 'stock' AND market_cap_rank IS NOT NULL
           ORDER BY market_cap_rank`,
        )
        .catch((err) => {
          log.error("loading stocks failed", err);
          return { rows: [] };
        });
      if (rows.length === 0) {
        await sleep(30_000);
        continue;
      }
      const started = Date.now();
      let n = 0;
      for (const r of rows) {
        if (this.stopped) return;
        try {
          if (r.profile_age_h == null || r.profile_age_h > this.cfg.profileMaxAgeHours) await this.refreshProfile(r.id, r.symbol);
          await this.refreshQuote(r.id, r.symbol);
          n++;
        } catch (err) {
          log.warn(`refresh failed for ${r.symbol}`, err);
        }
        if (n % 25 === 0) await rankStocks(this.pool).catch(() => {});
      }
      await rankStocks(this.pool).catch(() => {});
      log.info(`stock quotes refreshed for ${n}/${rows.length} in ${Math.round((Date.now() - started) / 1000)}s`);
      // A big plan could loop many times a minute; once a minute is plenty next to the live stream.
      await sleep(Math.max(0, MIN_PASS_MS - (Date.now() - started)));
    }
  }

  private async refreshProfile(id: string, symbol: string): Promise<void> {
    const details: Record<string, number | string> = {};
    let profile: Awaited<ReturnType<FinnhubClient["profile"]>> = {};
    if (!this.profileBlocked) {
      profile = await this.client.profile(symbol).catch((err) => this.planBlocked(err, "profile"));
      if (profile.weburl) details.website = profile.weburl;
    }
    if (!this.metricsBlocked) {
      const m = (await this.client.metrics(symbol).catch((err) => this.planBlocked(err, "metrics"))).metric ?? {};
      const put = (k: string, v: number | undefined) => {
        if (v != null && Number.isFinite(v)) details[k] = v;
      };
      put("pe", m.peTTM ?? m.peBasicExclExtraTTM);
      put("beta", m.beta);
      put("dividend_yield", m.currentDividendYieldTTM ?? m.dividendYieldIndicatedAnnual);
      put("week52_high", m["52WeekHigh"]);
      put("week52_low", m["52WeekLow"]);
      put("avg_volume_10d", m["10DayAverageTradingVolume"] != null ? m["10DayAverageTradingVolume"] * 1e6 : undefined);
    }
    await this.pool.query(
      `UPDATE assets SET
         image_url = COALESCE($2, image_url),
         exchange = COALESCE($3, exchange),
         circulating_supply = COALESCE($4, circulating_supply),
         market_cap = COALESCE($4 * ref_price, $5, market_cap),
         details = details || $6::jsonb,
         metadata_updated_at = now()
       WHERE id = $1`,
      [
        id,
        profile.logo || null,
        profile.exchange || null,
        profile.shareOutstanding ? profile.shareOutstanding * 1e6 : null,
        profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null,
        JSON.stringify(details),
      ],
    );
  }

  private async refreshQuote(id: string, symbol: string): Promise<void> {
    const u = quoteUpdate(await this.client.quote(symbol));
    if (!u) return;
    await this.pool.query(
      `UPDATE assets SET
         ref_price = $2,
         price_change_pct_24h = $3,
         market_cap = COALESCE(circulating_supply * $2, market_cap),
         total_volume = COALESCE((details->>'avg_volume_10d')::float8 * $2, total_volume),
         details = details || $4::jsonb,
         quote_updated_at = to_timestamp($5 / 1000.0)
       WHERE id = $1`,
      [id, u.price, u.pct, JSON.stringify(u.details), u.at],
    );
  }

  /**
   * Reference rates for every pair in one call, and each pair's change over
   * 24 hours from our own candles. Pairs the stream covers show its price;
   * this is the fallback and the base for the % change.
   */
  async refreshForex(): Promise<void> {
    let rates: Record<string, number> = {};
    if (!this.ratesBlocked) rates = await this.client.forexRates("USD").catch((err) => this.planBlocked(err, "rates"));
    for (const p of FOREX_PAIRS) {
      const id = forexId(p.base, p.quote);
      await this.pool.query(
        `WITH latest AS (
           SELECT close FROM candles_1m WHERE asset_id = $1 AND ts > now() - interval '4 days' ORDER BY ts DESC LIMIT 1
         ), day_ago AS (
           SELECT close FROM candles_1m
           WHERE asset_id = $1 AND ts <= now() - interval '24 hours' AND ts > now() - interval '5 days'
           ORDER BY ts DESC LIMIT 1
         ), prev_day AS (
           SELECT close FROM history_daily WHERE asset_id = $1 AND day < (now() AT TIME ZONE 'UTC')::date
           ORDER BY day DESC LIMIT 1
         ), px AS (SELECT COALESCE($2::float8, (SELECT close FROM latest)) AS p)
         UPDATE assets SET
           ref_price = COALESCE(px.p, ref_price),
           price_change_pct_24h = (px.p / NULLIF(COALESCE((SELECT close FROM day_ago), (SELECT close FROM prev_day)), 0) - 1) * 100,
           quote_updated_at = CASE WHEN px.p IS NULL THEN quote_updated_at ELSE now() END,
           metadata_updated_at = now()
         FROM px WHERE id = $1`,
        [id, crossRate(rates, p.base, p.quote)],
      );
    }
  }

  /** 7-day sparkline and change from our hourly candles, with daily history filling the start. */
  async refreshSparklines(): Promise<void> {
    const { rows } = await this.pool.query<{ asset_id: string; ts: Date; close: number }>(
      `WITH own AS (
         SELECT c.asset_id, c.ts, c.close FROM candles_1h c JOIN assets a ON a.id = c.asset_id
         WHERE a.asset_class IN ('stock', 'forex') AND c.ts >= now() - interval '7 days'
       ), first_own AS (SELECT asset_id, min(ts) AS m FROM own GROUP BY asset_id)
       SELECT h.asset_id, h.day::timestamptz AS ts, h.close
       FROM history_daily h JOIN assets a ON a.id = h.asset_id LEFT JOIN first_own f ON f.asset_id = h.asset_id
       WHERE a.asset_class IN ('stock', 'forex') AND h.day >= (now() - interval '7 days')::date
         AND (f.m IS NULL OR h.day::timestamptz < f.m)
       UNION ALL
       SELECT asset_id, ts, close FROM own
       ORDER BY 1, 2`,
    );
    const byAsset = new Map<string, { ts: number; close: number }[]>();
    for (const r of rows) {
      let list = byAsset.get(r.asset_id);
      if (!list) byAsset.set(r.asset_id, (list = []));
      list.push({ ts: r.ts.getTime(), close: r.close });
    }
    const payload = [...byAsset].map(([id, pts]) => {
      const first = pts[0]!;
      const last = pts.at(-1)!;
      const coversWeek = Date.now() - first.ts > 6.5 * 86400_000;
      return {
        id,
        spark: downsample(pts.map((p) => p.close), 42),
        pct7d: coversWeek && first.close > 0 ? (last.close / first.close - 1) * 100 : null,
      };
    });
    if (payload.length === 0) return;
    await this.pool.query(
      `UPDATE assets a SET sparkline_7d = x.spark, price_change_pct_7d = x.pct7d
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, spark real[], pct7d float8)
       WHERE a.id = x.id`,
      [JSON.stringify(payload)],
    );
  }

  /** A year of daily closes per asset, once. Finnhub only serves these on paid plans. */
  async backfill(): Promise<void> {
    const { rows } = await this.pool.query<{ id: string; symbol: string; asset_class: "stock" | "forex" }>(
      `SELECT a.id, a.symbol, a.asset_class FROM assets a
       WHERE a.asset_class IN ('stock', 'forex') AND a.market_cap_rank IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM history_daily h WHERE h.asset_id = a.id)
       ORDER BY a.asset_class DESC, a.market_cap_rank`,
    );
    if (rows.length === 0) return;
    const to = Math.floor(Date.now() / 1000);
    const from = to - this.cfg.backfillDays * 86400;
    let done = 0;
    for (const r of rows) {
      if (this.stopped) return;
      try {
        const res =
          r.asset_class === "stock"
            ? await this.client.stockCandles(r.symbol, from, to)
            : await this.client.forexCandles(streamSymbol({ symbol: r.symbol, assetClass: "forex" }), from, to);
        if (res.s !== "ok" || !res.t || !res.c) continue;
        const today = new Date().toISOString().slice(0, 10);
        const points = res.t
          .map((t, i) => ({ day: new Date(t * 1000).toISOString().slice(0, 10), close: res.c![i], volume: res.v?.[i] ?? null }))
          .filter((p) => p.day !== today && p.close != null && p.close > 0);
        if (points.length === 0) continue;
        await this.pool.query(
          `INSERT INTO history_daily (asset_id, day, close, volume)
           SELECT $1, day, close, volume FROM jsonb_to_recordset($2::jsonb) AS x(day date, close float8, volume float8)
           ON CONFLICT (asset_id, day) DO NOTHING`,
          [r.id, JSON.stringify(points)],
        );
        done++;
      } catch (err) {
        if (err instanceof FinnhubPlanError) {
          log.info("daily price history needs a paid Finnhub plan; charts fill in from live trades instead");
          return;
        }
        log.warn(`history backfill failed for ${r.symbol}`, err);
      }
    }
    log.info(`stock and forex history backfill finished: ${done}/${rows.length}`);
    // New history gives forex its 24h change and every list its 7-day line straight away.
    if (done > 0) {
      await this.refreshForex();
      await this.refreshSparklines();
    }
  }

  /** Logs once and turns the endpoint off when the plan doesn't include it. */
  private planBlocked(err: unknown, what: "profile" | "metrics" | "rates"): never | Record<string, never> {
    if (!(err instanceof FinnhubPlanError)) throw err;
    if (what === "profile") this.profileBlocked = true;
    if (what === "metrics") this.metricsBlocked = true;
    if (what === "rates") this.ratesBlocked = true;
    log.warn(`Finnhub plan doesn't include ${what}; skipping it`, err.message);
    return {};
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
