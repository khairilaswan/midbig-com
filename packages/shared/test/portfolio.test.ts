import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertHit,
  betaTo,
  computeHoldings,
  dailyReturns,
  historicalRisk,
  looksStable,
  OversellError,
  presetScenarios,
  roundTarget,
  runScenario,
  SPX_ID,
  valueHoldings,
  type Txn,
} from "../src/index.ts";

const day = 86_400_000;
const t = (assetId: string, side: "buy" | "sell", quantity: number, price: number, at: number, fee = 0): Txn => ({
  assetId,
  side,
  quantity,
  price,
  fee,
  executedAt: at * day,
});

test("average cost: sells take cost out at the average price", () => {
  const [btc] = computeHoldings([
    t("bitcoin", "buy", 1, 50_000, 1, 10),
    t("bitcoin", "buy", 1, 70_000, 2, 10),
    t("bitcoin", "sell", 0.5, 80_000, 3, 5),
  ]);
  // Average cost is (50,010 + 70,010) / 2 = 60,010 per coin.
  assert.equal(btc!.quantity, 1.5);
  assert.equal(btc!.costBasis, 90_015);
  assert.equal(btc!.realized, 40_000 - 5 - 30_005);
});

test("transactions are replayed in time order, not entry order", () => {
  const [h] = computeHoldings([t("eth", "sell", 1, 3000, 5), t("eth", "buy", 2, 2000, 1)]);
  assert.equal(h!.quantity, 1);
  assert.equal(h!.costBasis, 2000);
  assert.equal(h!.realized, 1000);
});

test("selling more than held throws", () => {
  assert.throws(() => computeHoldings([t("eth", "buy", 1, 2000, 2), t("eth", "sell", 1, 3000, 1)]), OversellError);
});

test("selling everything clears cost and keeps realized profit", () => {
  const holdings = computeHoldings([t("sol", "buy", 3, 100, 1), t("sol", "sell", 3, 150, 2)]);
  const { rows, totals } = valueHoldings(holdings, () => 200);
  assert.equal(rows[0]!.quantity, 0);
  assert.equal(rows[0]!.unrealized, null);
  assert.equal(totals.value, 0);
  assert.equal(totals.realized, 150);
});

test("valueHoldings totals, weights and unpriced holdings", () => {
  const holdings = computeHoldings([t("bitcoin", "buy", 1, 60_000, 1), t("eth", "buy", 10, 2000, 1), t("dead", "buy", 5, 1, 1)]);
  const prices: Record<string, number> = { bitcoin: 90_000, eth: 3000 };
  const { rows, totals } = valueHoldings(holdings, (id) => prices[id]);
  assert.equal(totals.value, 120_000);
  assert.equal(totals.costBasis, 80_000);
  assert.equal(totals.unrealized, 40_000);
  assert.equal(totals.unrealizedPct, 50);
  assert.equal(totals.unpriced, 1);
  assert.equal(rows[0]!.assetId, "bitcoin");
  assert.equal(rows[0]!.weight, 0.75);
});

const positions = [
  { assetId: "bitcoin", symbol: "BTC", quantity: 1, price: 87_500, beta: 1 },
  { assetId: "eth", symbol: "ETH", quantity: 10, price: 3000, beta: 1.5 },
  { assetId: "tether", symbol: "USDT", quantity: 1000, price: 1, beta: 0, stable: true },
];

test("BTC target price moves others by beta, leaves stablecoins alone", () => {
  const r = runScenario(positions, { shocks: [{ assetId: "bitcoin", kind: "price", value: 70_000 }], followBtc: true });
  assert.equal(r.rows[0]!.newPrice, 70_000);
  assert.ok(Math.abs(r.rows[0]!.pct - -20) < 1e-9);
  assert.ok(Math.abs(r.rows[1]!.pct - -30) < 1e-9);
  assert.equal(r.rows[2]!.pct, 0);
  assert.ok(Math.abs(r.change - (-17_500 - 9000)) < 1e-6);
});

test("market-wide shock skips stablecoins and can't go below zero", () => {
  const r = runScenario(positions, { shocks: [{ assetId: "*", kind: "pct", value: -150 }], followBtc: false });
  assert.equal(r.rows[0]!.newPrice, 0);
  assert.equal(r.rows[2]!.newPrice, 1);
});

test("presets use round BTC targets about 20% away", () => {
  assert.equal(roundTarget(87_500, 0.8), 70_000);
  assert.equal(roundTarget(87_500, 1.2), 105_000);
  const labels = presetScenarios(87_500).map((s) => s.label);
  assert.ok(labels.includes("BTC drops to $70k"));
  assert.ok(labels.includes("BTC surges to $105k"));
  assert.equal(presetScenarios(null)[0]!.id, "crash-50");
});

test("beta, stablecoin detection and historical risk", () => {
  const btc = [100, 110, 99, 104, 101, 108, 102, 105, 100, 103, 107, 101, 104, 98, 102, 106, 100, 103, 99, 104, 108, 103];
  const alt = btc.map((p, i) => (i === 0 ? 50 : 0));
  // An alt that moves exactly twice as much as BTC each day.
  const btcR = dailyReturns(btc);
  for (let i = 1; i < alt.length; i++) alt[i] = alt[i - 1]! * (1 + 2 * btcR[i - 1]!);
  const beta = betaTo(dailyReturns(alt), btcR);
  assert.ok(beta != null && Math.abs(beta - 2) < 1e-9);
  assert.equal(betaTo([0.1, 0.2], [0.1, 0.2]), null);

  const flat = Array.from({ length: 30 }, (_, i) => 1 + (i % 2 ? 0.0005 : -0.0005));
  assert.ok(looksStable(1, dailyReturns(flat)));
  assert.ok(!looksStable(1, btcR));

  const days = btcR.map((_, i) => `2026-01-${String(i + 2).padStart(2, "0")}`);
  const risk = historicalRisk(new Map([["bitcoin", 10_000]]), days, new Map([["bitcoin", btcR]]));
  assert.ok(risk);
  assert.equal(risk.days, 21);
  assert.equal(risk.worstDay, "2026-01-03");
  assert.ok(Math.abs(risk.worst - 1000) < 1e-6);
});

test("alertHit", () => {
  assert.ok(alertHit("above", 100, 100));
  assert.ok(!alertHit("above", 100, 99.99));
  assert.ok(alertHit("below", 100, 50));
});

test("runScenario: stocks follow the S&P 500 by beta and ignore crypto shocks", () => {
  const r = runScenario(
    [
      { assetId: "bitcoin", symbol: "BTC", quantity: 1, price: 100_000 },
      { assetId: "stock-aapl", symbol: "AAPL", quantity: 10, price: 200, beta: 1.2, assetClass: "stock" },
      { assetId: "stock-ko", symbol: "KO", quantity: 10, price: 60, assetClass: "stock" },
    ],
    {
      shocks: [
        { assetId: SPX_ID, kind: "pct", value: -10 },
        { assetId: "*", kind: "pct", value: -50 },
      ],
      followBtc: false,
    },
  );
  const by = new Map(r.rows.map((x) => [x.assetId, x]));
  assert.equal(by.get("bitcoin")!.pct, -50);
  assert.ok(Math.abs(by.get("stock-aapl")!.pct - -12) < 1e-9);
  assert.equal(by.get("stock-aapl")!.driver, "spx");
  assert.equal(by.get("stock-ko")!.pct, -10);
  // A Bitcoin-only scenario leaves stocks alone.
  const btcOnly = runScenario(
    [{ assetId: "stock-aapl", symbol: "AAPL", quantity: 1, price: 200, beta: 1.2, assetClass: "stock" }],
    { shocks: [{ assetId: "bitcoin", kind: "pct", value: -30 }], followBtc: true },
  );
  assert.equal(btcOnly.rows[0]!.pct, 0);
});
