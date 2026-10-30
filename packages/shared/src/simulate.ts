/**
 * What-if simulator and risk figures for a set of holdings. Pure functions,
 * used in the browser so the simulator reacts instantly.
 */

export const BTC_ID = "bitcoin";

export interface SimPosition {
  assetId: string;
  symbol: string;
  quantity: number;
  /** Current USD price. */
  price: number;
  /** Sensitivity to Bitcoin's daily moves; 1 when unknown. */
  beta?: number | null;
  /** Stablecoins don't move in market-wide scenarios. */
  stable?: boolean;
}

/** A price change for one asset, or for every non-stable asset with assetId "*". */
export interface Shock {
  assetId: string;
  kind: "pct" | "price";
  value: number;
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  shocks: Shock[];
  /** Assets without their own shock move with Bitcoin, scaled by their beta. */
  followBtc: boolean;
}

export interface SimRow {
  assetId: string;
  symbol: string;
  quantity: number;
  price: number;
  newPrice: number;
  pct: number;
  value: number;
  newValue: number;
  /** Why it moved: its own shock, the "*" shock, or following Bitcoin. */
  driver: "own" | "all" | "btc" | "none";
}

export interface SimResult {
  rows: SimRow[];
  value: number;
  newValue: number;
  change: number;
  pct: number | null;
}

function shockPct(shock: Shock, price: number): number {
  if (shock.kind === "pct") return shock.value;
  return price > 0 ? (shock.value / price - 1) * 100 : 0;
}

export function runScenario(positions: SimPosition[], scenario: Pick<Scenario, "shocks" | "followBtc">): SimResult {
  const own = new Map(scenario.shocks.filter((s) => s.assetId !== "*").map((s) => [s.assetId, s]));
  const all = scenario.shocks.find((s) => s.assetId === "*");
  const btcPosition = positions.find((p) => p.assetId === BTC_ID);
  const btcShock = own.get(BTC_ID);
  // A Bitcoin target price needs Bitcoin's price; take it from the holdings when there.
  const btcPct =
    btcShock && (btcShock.kind === "pct" || btcPosition) ? shockPct(btcShock, btcPosition?.price ?? 0) : null;

  let value = 0;
  let newValue = 0;
  const rows = positions.map((p): SimRow => {
    let pct = 0;
    let driver: SimRow["driver"] = "none";
    const mine = own.get(p.assetId);
    if (mine) {
      pct = shockPct(mine, p.price);
      driver = "own";
    } else if (all && !p.stable) {
      pct = shockPct(all, p.price);
      driver = "all";
    } else if (scenario.followBtc && btcPct != null && !p.stable) {
      pct = (p.beta ?? 1) * btcPct;
      driver = "btc";
    }
    pct = Math.max(-100, pct);
    const newPrice = p.price * (1 + pct / 100);
    const v = p.quantity * p.price;
    const nv = p.quantity * newPrice;
    value += v;
    newValue += nv;
    return { assetId: p.assetId, symbol: p.symbol, quantity: p.quantity, price: p.price, newPrice, pct, value: v, newValue: nv, driver };
  });
  return { rows, value, newValue, change: newValue - value, pct: value > 0 ? (newValue / value - 1) * 100 : null };
}

/** "$70k", "$1.2M", "$950": short USD for scenario labels. */
export function usdShort(v: number): string {
  if (v >= 1e6) return `$${+(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${+(v / 1e3).toFixed(1)}k`;
  return `$${+v.toPrecision(3)}`;
}

/** A round number about `factor` times the price: 85,000 * 0.8 -> 70,000. */
export function roundTarget(price: number, factor: number): number {
  const raw = price * factor;
  // The biggest 1, 2 or 5 step under 7% of the price, e.g. 5,000 for 70,000.
  const unit = 10 ** Math.floor(Math.log10(raw * 0.07));
  const step = [5, 2, 1].map((m) => m * unit).find((s) => s <= raw * 0.07) ?? unit;
  return factor < 1 ? Math.floor(raw / step) * step : Math.ceil(raw / step) * step;
}

/** Ready-made scenarios. The Bitcoin targets are round numbers about 20% from today's price. */
export function presetScenarios(btcPrice: number | null): Scenario[] {
  const out: Scenario[] = [];
  if (btcPrice && btcPrice > 0) {
    const down = roundTarget(btcPrice, 0.8);
    const up = roundTarget(btcPrice, 1.2);
    out.push(
      {
        id: "btc-down",
        label: `BTC drops to ${usdShort(down)}`,
        description: "Bitcoin falls to this price and other coins move with it, scaled by how closely each followed Bitcoin over the last 90 days.",
        shocks: [{ assetId: BTC_ID, kind: "price", value: down }],
        followBtc: true,
      },
      {
        id: "btc-up",
        label: `BTC surges to ${usdShort(up)}`,
        description: "Bitcoin rises to this price and other coins move with it, scaled by how closely each followed Bitcoin over the last 90 days.",
        shocks: [{ assetId: BTC_ID, kind: "price", value: up }],
        followBtc: true,
      },
    );
  }
  out.push(
    {
      id: "crash-50",
      label: "Crypto crash: everything −50%",
      description: "Every coin except stablecoins halves.",
      shocks: [{ assetId: "*", kind: "pct", value: -50 }],
      followBtc: false,
    },
    {
      id: "bear-75",
      label: "Deep bear market: BTC −75%",
      description: "A drop like 2021–2022. Bitcoin loses three quarters and other coins follow it by their beta.",
      shocks: [{ assetId: BTC_ID, kind: "pct", value: -75 }],
      followBtc: true,
    },
    {
      id: "altseason",
      label: "Altcoin season: BTC +30%, others +100%",
      description: "Bitcoin rises 30% and every other coin except stablecoins doubles.",
      shocks: [
        { assetId: BTC_ID, kind: "pct", value: 30 },
        { assetId: "*", kind: "pct", value: 100 },
      ],
      followBtc: false,
    },
  );
  return out;
}

/** Simple daily returns; null where either day is missing. */
export function dailyReturns(closes: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    out.push(a != null && b != null && a > 0 ? b / a - 1 : null);
  }
  return out;
}

/** Days needed before a beta or volatility is worth showing. */
export const MIN_RISK_DAYS = 20;

/** Slope of an asset's daily returns against Bitcoin's, from days both have. */
export function betaTo(returns: (number | null)[], btcReturns: (number | null)[]): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(returns.length, btcReturns.length); i++) {
    const x = btcReturns[i];
    const y = returns[i];
    if (x != null && y != null) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < MIN_RISK_DAYS) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  for (let i = 0; i < xs.length; i++) {
    cov += (xs[i]! - mx) * (ys[i]! - my);
    vx += (xs[i]! - mx) ** 2;
  }
  return vx > 0 ? cov / vx : null;
}

/** Standard deviation of daily returns. */
export function volatility(returns: (number | null)[]): number | null {
  const xs = returns.filter((r): r is number => r != null);
  if (xs.length < MIN_RISK_DAYS) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Looks like a dollar stablecoin: within 3% of $1 and barely moving day to day. */
export function looksStable(price: number, returns: (number | null)[]): boolean {
  const vol = volatility(returns);
  return Math.abs(price - 1) < 0.03 && vol != null && vol < 0.005;
}

export interface HistoricalRisk {
  /** Days of history used. */
  days: number;
  /** Loss on 1 day in 20, in USD (95% one-day value at risk). Positive means a loss. */
  var95: number;
  /** Worst one-day loss in the history, in USD, and the day it happened. */
  worst: number;
  worstDay: string;
  /** Best one-day gain in the history, in USD. */
  best: number;
}

/**
 * Replays each past day's price moves on today's holdings. Missing data for
 * an asset on a day counts as no move.
 */
export function historicalRisk(
  values: Map<string, number>,
  days: string[],
  returnsByAsset: Map<string, (number | null)[]>,
): HistoricalRisk | null {
  const pnl: { day: string; v: number }[] = [];
  for (let i = 0; i < days.length; i++) {
    let v = 0;
    let any = false;
    for (const [id, value] of values) {
      const r = returnsByAsset.get(id)?.[i];
      if (r == null) continue;
      v += value * r;
      any = true;
    }
    if (any) pnl.push({ day: days[i]!, v });
  }
  if (pnl.length < MIN_RISK_DAYS) return null;
  const sorted = [...pnl].sort((a, b) => a.v - b.v);
  const at = Math.floor(sorted.length * 0.05);
  return {
    days: pnl.length,
    var95: Math.max(0, -sorted[at]!.v),
    worst: Math.max(0, -sorted[0]!.v),
    worstDay: sorted[0]!.day,
    best: Math.max(0, sorted[sorted.length - 1]!.v),
  };
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
