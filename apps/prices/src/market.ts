import type { LivePrice } from "@midbig/shared";

export interface Trade {
  assetId: string;
  source: string;
  price: number;
  /** Base-currency quantity; 0 when the feed doesn't say. */
  size: number;
  /** Trade time, ms since epoch. */
  ts: number;
}

export interface Candle {
  assetId: string;
  /** Start of the minute, ms since epoch. */
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

interface AssetState {
  price: number;
  t: number;
  sources: Set<string>;
}

const MINUTE = 60_000;

/**
 * Latest price per asset across all feeds, plus which feeds are alive.
 *
 * The price is the most recent trade from any feed. A price counts as
 * confirmed while a feed that quotes the asset is connected and talking: no
 * new trade on a live connection means the last trade is still the price.
 */
export class MarketState {
  private readonly assets = new Map<string, AssetState>();
  private readonly sourceAlive = new Map<string, number>();
  private readonly dirty = new Set<string>();
  readonly candles = new CandleBuilder();

  /** Declares that a feed quotes an asset, before any trade arrives. */
  addCoverage(source: string, assetId: string): void {
    const a = this.assets.get(assetId);
    if (a) a.sources.add(source);
    else this.assets.set(assetId, { price: 0, t: 0, sources: new Set([source]) });
  }

  /** Forgets all coverage for a feed, e.g. before it resubscribes. */
  clearCoverage(source: string): void {
    for (const a of this.assets.values()) a.sources.delete(source);
  }

  /** Records that a feed's connection delivered a message at `at`. */
  alive(source: string, at: number = Date.now()): void {
    this.sourceAlive.set(source, at);
  }

  /** Marks a feed as down so its assets stop counting as confirmed. */
  down(source: string): void {
    this.sourceAlive.delete(source);
  }

  trade(trade: Trade): void {
    if (!(trade.price > 0) || !Number.isFinite(trade.price)) return;
    let a = this.assets.get(trade.assetId);
    if (!a) {
      a = { price: 0, t: 0, sources: new Set([trade.source]) };
      this.assets.set(trade.assetId, a);
    }
    a.sources.add(trade.source);
    // Feeds aren't perfectly in step; never let an older trade replace a newer one.
    if (trade.ts >= a.t) {
      a.price = trade.price;
      a.t = trade.ts;
      this.dirty.add(trade.assetId);
    }
    this.candles.add(trade);
  }

  get(assetId: string): LivePrice | null {
    const a = this.assets.get(assetId);
    if (!a || a.t === 0) return null;
    let asOf = a.t;
    for (const s of a.sources) asOf = Math.max(asOf, this.sourceAlive.get(s) ?? 0);
    return { id: assetId, p: a.price, t: a.t, asOf, src: [...a.sources].sort() };
  }

  /** Prices that changed since the last call. */
  takeDirty(): LivePrice[] {
    const out: LivePrice[] = [];
    for (const id of this.dirty) {
      const lp = this.get(id);
      if (lp) out.push(lp);
    }
    this.dirty.clear();
    return out;
  }

  all(): LivePrice[] {
    const out: LivePrice[] = [];
    for (const id of this.assets.keys()) {
      const lp = this.get(id);
      if (lp) out.push(lp);
    }
    return out;
  }

  sourcesStatus(now: number = Date.now()): Record<string, { lastMessageAgoMs: number | null }> {
    const out: Record<string, { lastMessageAgoMs: number | null }> = {};
    for (const [s, at] of this.sourceAlive) out[s] = { lastMessageAgoMs: now - at };
    return out;
  }
}

/** Builds 1-minute OHLCV candles per asset from trades. */
export class CandleBuilder {
  private readonly open = new Map<string, Candle>();
  /** Start of the newest minute already closed per asset; later trades for it are dropped. */
  private readonly lastClosed = new Map<string, number>();
  private closed: Candle[] = [];

  add(trade: Trade, now: number = Date.now()): void {
    // Feeds replay a few recent trades on (re)connect; anything older than a
    // minute would overwrite a candle that was already written in full.
    if (trade.ts < now - MINUTE) return;
    const minute = Math.floor(trade.ts / MINUTE) * MINUTE;
    const c = this.open.get(trade.assetId);
    // Late trade for a minute that's already closed (feeds can lag each other by a moment).
    if ((c && minute < c.ts) || minute <= (this.lastClosed.get(trade.assetId) ?? -1)) return;
    if (!c || minute > c.ts) {
      if (c) this.close(c);
      this.open.set(trade.assetId, {
        assetId: trade.assetId,
        ts: minute,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.size,
        trades: 1,
      });
      return;
    }
    c.high = Math.max(c.high, trade.price);
    c.low = Math.min(c.low, trade.price);
    c.close = trade.price;
    c.volume += trade.size;
    c.trades += 1;
  }

  /**
   * Returns candles to write: every candle closed since the last call, plus a
   * copy of each still-forming candle so charts see the current minute. Open
   * candles from before `now`'s minute are closed here, so a market that stops
   * trading still gets its last candle written.
   */
  drain(now: number = Date.now()): Candle[] {
    const currentMinute = Math.floor(now / MINUTE) * MINUTE;
    const out = this.closed;
    this.closed = [];
    for (const [id, c] of this.open) {
      if (c.ts < currentMinute) {
        this.open.delete(id);
        this.lastClosed.set(id, c.ts);
        out.push(c);
      } else {
        out.push({ ...c });
      }
    }
    return out;
  }

  private close(c: Candle): void {
    this.lastClosed.set(c.assetId, c.ts);
    this.closed.push(c);
  }
}
