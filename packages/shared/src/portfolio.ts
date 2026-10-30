/**
 * Portfolio maths: holdings and profit from a list of buys and sells, using
 * the average cost method (a sell takes cost out at the average price paid).
 */

export interface Txn {
  assetId: string;
  side: "buy" | "sell";
  quantity: number;
  /** USD price per unit. */
  price: number;
  /** USD fee for the whole trade. */
  fee: number;
  /** ms since epoch. */
  executedAt: number;
}

export interface Holding {
  assetId: string;
  quantity: number;
  /** USD paid for the units still held, fees included. */
  costBasis: number;
  /** Profit locked in by sells, after fees. */
  realized: number;
}

/** Quantities below this are treated as zero, to absorb float rounding. */
const DUST = 1e-12;

/** Sorts by time; on the same timestamp, buys go first so a same-minute round trip works. */
function chronological(txns: Txn[]): Txn[] {
  return [...txns].sort((a, b) => a.executedAt - b.executedAt || (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1));
}

/**
 * Replays transactions in time order. Throws if a sell would take a holding
 * below zero, so callers can reject it.
 */
export function computeHoldings(txns: Txn[]): Holding[] {
  const map = new Map<string, Holding>();
  for (const t of chronological(txns)) {
    let h = map.get(t.assetId);
    if (!h) map.set(t.assetId, (h = { assetId: t.assetId, quantity: 0, costBasis: 0, realized: 0 }));
    if (t.side === "buy") {
      h.quantity += t.quantity;
      h.costBasis += t.quantity * t.price + t.fee;
      continue;
    }
    if (t.quantity > h.quantity * (1 + 1e-9) + DUST) {
      throw new OversellError(t.assetId, h.quantity, t.quantity, t.executedAt);
    }
    const qty = Math.min(t.quantity, h.quantity);
    const costOut = h.quantity > 0 ? h.costBasis * (qty / h.quantity) : 0;
    h.realized += qty * t.price - t.fee - costOut;
    h.quantity -= qty;
    h.costBasis -= costOut;
    if (h.quantity < DUST) {
      h.quantity = 0;
      h.costBasis = 0;
    }
  }
  return [...map.values()];
}

export class OversellError extends Error {
  constructor(
    readonly assetId: string,
    readonly held: number,
    readonly sold: number,
    readonly at: number,
  ) {
    super(`Sell of ${sold} ${assetId} is more than the ${held} held at that time`);
  }
}

export interface ValuedHolding extends Holding {
  price: number | null;
  value: number | null;
  /** Average cost per unit still held. */
  avgCost: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  /** Share of the portfolio's current value, 0 to 1. */
  weight: number | null;
}

export interface PortfolioTotals {
  value: number;
  costBasis: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  /** Holdings with no price; their value is left out of the totals. */
  unpriced: number;
}

export function valueHoldings(
  holdings: Holding[],
  priceOf: (assetId: string) => number | null | undefined,
): { rows: ValuedHolding[]; totals: PortfolioTotals } {
  let value = 0;
  let costBasis = 0;
  let realized = 0;
  let unpriced = 0;
  const rows = holdings.map((h) => {
    const price = priceOf(h.assetId) ?? null;
    const v = price == null ? null : h.quantity * price;
    realized += h.realized;
    if (h.quantity > 0) {
      if (v == null) unpriced++;
      else {
        value += v;
        costBasis += h.costBasis;
      }
    }
    return {
      ...h,
      price,
      value: v,
      avgCost: h.quantity > 0 ? h.costBasis / h.quantity : null,
      unrealized: v == null || h.quantity === 0 ? null : v - h.costBasis,
      unrealizedPct: v == null || h.costBasis <= 0 ? null : (v / h.costBasis - 1) * 100,
      weight: null as number | null,
    };
  });
  for (const r of rows) r.weight = r.value != null && value > 0 ? r.value / value : null;
  rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  return {
    rows,
    totals: {
      value,
      costBasis,
      unrealized: value - costBasis,
      unrealizedPct: costBasis > 0 ? (value / costBasis - 1) * 100 : null,
      realized,
      unpriced,
    },
  };
}
