import type WebSocket from "ws";
import type { MarketState } from "../market.js";
import { Feed, parseTime } from "./feed.js";

/** One row of GET /products on the Coinbase Exchange REST API. */
export interface CoinbaseProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  status: string;
  trading_disabled?: boolean;
}

export type CoinbaseEvent =
  | { kind: "trade"; productId: string; price: number; size: number; ts: number }
  | { kind: "error"; message: string }
  | { kind: "other" };

/** USD markets for assets we track: product id ("BTC-USD") -> asset id. */
export function coinbaseUsdMarkets(products: CoinbaseProduct[], symbols: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of products) {
    if (p.quote_currency !== "USD" || p.status !== "online" || p.trading_disabled) continue;
    const assetId = symbols.get(p.base_currency.toUpperCase());
    if (assetId) out.set(p.id, assetId);
  }
  return out;
}

export function parseCoinbaseMessage(msg: unknown): CoinbaseEvent {
  if (typeof msg !== "object" || msg === null) return { kind: "other" };
  const m = msg as Record<string, unknown>;
  if (m.type === "ticker" && typeof m.product_id === "string" && typeof m.time === "string") {
    const price = Number(m.price);
    if (!(price > 0)) return { kind: "other" };
    return {
      kind: "trade",
      productId: m.product_id,
      price,
      size: Number(m.last_size) || 0,
      ts: parseTime(m.time),
    };
  }
  if (m.type === "error") return { kind: "error", message: String(m.message ?? "") + " " + String(m.reason ?? "") };
  return { kind: "other" };
}

/**
 * Coinbase Exchange public feed. The ticker channel sends one message per
 * trade with its price and size; one heartbeat subscription keeps the
 * connection provably alive when nothing trades.
 */
export class CoinbaseFeed extends Feed {
  private markets = new Map<string, string>();

  constructor(
    url: string,
    private readonly restUrl: string,
    state: MarketState,
    symbols: () => Map<string, string>,
  ) {
    super("coinbase", url, state, symbols);
  }

  protected async onOpen(ws: WebSocket): Promise<void> {
    const res = await fetch(`${this.restUrl}/products`, {
      headers: { accept: "application/json", "user-agent": "midbig-prices/0.1" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`products request failed: ${res.status}`);
    this.markets = coinbaseUsdMarkets((await res.json()) as CoinbaseProduct[], this.symbols());
    this.state.clearCoverage(this.name);
    for (const assetId of this.markets.values()) this.state.addCoverage(this.name, assetId);
    const productIds = [...this.markets.keys()];
    this.log.info(`subscribing to ${productIds.length} USD markets`);
    if (productIds.length === 0) return;
    this.send(ws, {
      type: "subscribe",
      product_ids: productIds,
      channels: ["ticker", { name: "heartbeat", product_ids: [productIds.includes("BTC-USD") ? "BTC-USD" : productIds[0]] }],
    });
  }

  protected onMessage(msg: unknown): void {
    const ev = parseCoinbaseMessage(msg);
    if (ev.kind === "trade") {
      const assetId = this.markets.get(ev.productId);
      if (assetId) this.state.trade({ assetId, source: this.name, price: ev.price, size: ev.size, ts: ev.ts });
    } else if (ev.kind === "error") {
      this.log.warn(`feed error: ${ev.message}`);
    }
  }
}
