import type WebSocket from "ws";
import type { MarketState } from "../market.js";
import { Feed, parseTime } from "./feed.js";

/** One pair from the v2 "instrument" channel snapshot. */
export interface KrakenPair {
  symbol: string;
  base: string;
  quote: string;
  status: string;
}

export type KrakenEvent =
  | { kind: "pairs"; pairs: KrakenPair[] }
  | { kind: "trades"; trades: { symbol: string; price: number; size: number; ts: number }[] }
  | { kind: "error"; message: string }
  | { kind: "other" };

const SUBSCRIBE_CHUNK = 100;

/** USD pairs for assets we track: pair symbol ("BTC/USD") -> asset id. */
export function krakenUsdMarkets(pairs: KrakenPair[], symbols: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of pairs) {
    if (p.quote !== "USD" || p.status !== "online") continue;
    const assetId = symbols.get(p.base.toUpperCase());
    if (assetId) out.set(p.symbol, assetId);
  }
  return out;
}

export function parseKrakenMessage(msg: unknown): KrakenEvent {
  if (typeof msg !== "object" || msg === null) return { kind: "other" };
  const m = msg as Record<string, unknown>;
  if (m.method === "subscribe" && m.success === false) return { kind: "error", message: String(m.error ?? "subscribe failed") };
  if (m.channel === "instrument" && m.type === "snapshot") {
    const data = m.data as { pairs?: KrakenPair[] } | undefined;
    return { kind: "pairs", pairs: data?.pairs ?? [] };
  }
  if (m.channel === "trade" && Array.isArray(m.data)) {
    const trades = [];
    for (const t of m.data as Record<string, unknown>[]) {
      const price = Number(t.price);
      if (typeof t.symbol !== "string" || typeof t.timestamp !== "string" || !(price > 0)) continue;
      trades.push({ symbol: t.symbol, price, size: Number(t.qty) || 0, ts: parseTime(t.timestamp) });
    }
    return { kind: "trades", trades };
  }
  return { kind: "other" };
}

/**
 * Kraken WebSocket v2. On connect it asks for the instrument list, then
 * subscribes to trades for every USD pair we track. The snapshot of recent
 * trades seeds prices for quiet markets; Kraken's own heartbeat keeps the
 * connection provably alive between trades.
 */
export class KrakenFeed extends Feed {
  private markets = new Map<string, string>();

  constructor(url: string, state: MarketState, symbols: () => Map<string, string>) {
    super("kraken", url, state, symbols);
  }

  protected async onOpen(ws: WebSocket): Promise<void> {
    this.send(ws, { method: "subscribe", params: { channel: "instrument", snapshot: true } });
  }

  protected onMessage(msg: unknown, ws: WebSocket): void {
    const ev = parseKrakenMessage(msg);
    if (ev.kind === "pairs") {
      this.markets = krakenUsdMarkets(ev.pairs, this.symbols());
      this.state.clearCoverage(this.name);
      for (const assetId of this.markets.values()) this.state.addCoverage(this.name, assetId);
      // Only the snapshot was needed; instrument updates aren't.
      this.send(ws, { method: "unsubscribe", params: { channel: "instrument" } });
      const symbols = [...this.markets.keys()];
      this.log.info(`subscribing to ${symbols.length} USD pairs`);
      for (let i = 0; i < symbols.length; i += SUBSCRIBE_CHUNK) {
        this.send(ws, {
          method: "subscribe",
          params: { channel: "trade", symbol: symbols.slice(i, i + SUBSCRIBE_CHUNK), snapshot: true },
        });
      }
    } else if (ev.kind === "trades") {
      for (const t of ev.trades) {
        const assetId = this.markets.get(t.symbol);
        if (assetId) this.state.trade({ assetId, source: this.name, price: t.price, size: t.size, ts: t.ts });
      }
    } else if (ev.kind === "error") {
      this.log.warn(`feed error: ${ev.message}`);
    }
  }
}
