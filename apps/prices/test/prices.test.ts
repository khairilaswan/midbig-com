import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPrice } from "../src/alerts.ts";
import { CandleBuilder, MarketState } from "../src/market.ts";
import { buildSymbolMap, downsample } from "../src/metadata.ts";
import { coinbaseUsdMarkets, parseCoinbaseMessage } from "../src/sources/coinbase.ts";
import { krakenUsdMarkets, parseKrakenMessage } from "../src/sources/kraken.ts";
import { parseTime } from "../src/sources/feed.ts";

const T0 = Date.UTC(2026, 9, 30, 12, 0, 0);

test("buildSymbolMap prefers the best-ranked coin for a shared ticker", () => {
  const map = buildSymbolMap([
    { id: "fake-btc", symbol: "btc", rank: 400 },
    { id: "bitcoin", symbol: "btc", rank: 1 },
    { id: "ethereum", symbol: "eth", rank: 2 },
    { id: "unranked", symbol: "eth", rank: null },
  ]);
  assert.equal(map.get("BTC"), "bitcoin");
  assert.equal(map.get("ETH"), "ethereum");
});

test("downsample keeps first and last points", () => {
  const out = downsample(Array.from({ length: 168 }, (_, i) => i), 42);
  assert.equal(out.length, 42);
  assert.equal(out[0], 0);
  assert.equal(out.at(-1), 167);
  assert.deepEqual(downsample([1, 2, 3], 42), [1, 2, 3]);
});

test("parseTime handles microsecond timestamps", () => {
  assert.equal(parseTime("2026-10-30T12:00:00.123456Z"), T0 + 123);
});

test("Coinbase: USD markets and ticker parsing", () => {
  const symbols = new Map([["BTC", "bitcoin"], ["ETH", "ethereum"]]);
  const markets = coinbaseUsdMarkets(
    [
      { id: "BTC-USD", base_currency: "BTC", quote_currency: "USD", status: "online" },
      { id: "BTC-EUR", base_currency: "BTC", quote_currency: "EUR", status: "online" },
      { id: "ETH-USD", base_currency: "ETH", quote_currency: "USD", status: "online", trading_disabled: true },
      { id: "XYZ-USD", base_currency: "XYZ", quote_currency: "USD", status: "online" },
    ],
    symbols,
  );
  assert.deepEqual([...markets], [["BTC-USD", "bitcoin"]]);

  const ev = parseCoinbaseMessage({
    type: "ticker",
    product_id: "BTC-USD",
    price: "67123.45",
    last_size: "0.01",
    time: "2026-10-30T12:00:00.123456Z",
  });
  assert.deepEqual(ev, { kind: "trade", productId: "BTC-USD", price: 67123.45, size: 0.01, ts: T0 + 123 });
  assert.equal(parseCoinbaseMessage({ type: "heartbeat", product_id: "BTC-USD" }).kind, "other");
  assert.equal(parseCoinbaseMessage({ type: "error", message: "bad", reason: "x" }).kind, "error");
});

test("Kraken: USD pairs and trade parsing", () => {
  const symbols = new Map([["BTC", "bitcoin"], ["DOGE", "dogecoin"]]);
  const pairsEv = parseKrakenMessage({
    channel: "instrument",
    type: "snapshot",
    data: {
      pairs: [
        { symbol: "BTC/USD", base: "BTC", quote: "USD", status: "online" },
        { symbol: "BTC/EUR", base: "BTC", quote: "EUR", status: "online" },
        { symbol: "DOGE/USD", base: "DOGE", quote: "USD", status: "maintenance" },
      ],
    },
  });
  assert.equal(pairsEv.kind, "pairs");
  if (pairsEv.kind !== "pairs") return;
  assert.deepEqual([...krakenUsdMarkets(pairsEv.pairs, symbols)], [["BTC/USD", "bitcoin"]]);

  const tradesEv = parseKrakenMessage({
    channel: "trade",
    type: "update",
    data: [
      { symbol: "BTC/USD", side: "buy", price: 67000.1, qty: 0.5, timestamp: "2026-10-30T12:00:00.123456Z" },
      { symbol: "BTC/USD", price: "not-a-number", qty: 1, timestamp: "2026-10-30T12:00:00Z" },
    ],
  });
  assert.deepEqual(tradesEv, { kind: "trades", trades: [{ symbol: "BTC/USD", price: 67000.1, size: 0.5, ts: T0 + 123 }] });
  assert.equal(parseKrakenMessage({ channel: "heartbeat" }).kind, "other");
  assert.equal(parseKrakenMessage({ method: "subscribe", success: false, error: "nope" }).kind, "error");
});

test("CandleBuilder builds OHLCV per minute and drops late or replayed trades", () => {
  const b = new CandleBuilder();
  const now = T0 + 30_000;
  const t = (price: number, ts: number, size = 1) => b.add({ assetId: "bitcoin", source: "x", price, size, ts }, now);
  t(100, T0 + 1_000);
  t(105, T0 + 2_000);
  t(99, T0 + 3_000, 2);
  t(101, T0 + 4_000);
  t(50, T0 - 120_000); // replayed trade from two minutes ago

  let out = b.drain(now);
  assert.deepEqual(out, [
    { assetId: "bitcoin", ts: T0, open: 100, high: 105, low: 99, close: 101, volume: 5, trades: 4 },
  ]);

  // Still forming: drain returns a copy and keeps building.
  t(102, T0 + 50_000);
  t(110, T0 + 61_000); // next minute closes the first
  out = b.drain(T0 + 62_000);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.close, 102);
  assert.equal(out[1]!.ts, T0 + 60_000);

  // A trade for the closed minute arriving late must not create a partial candle.
  b.add({ assetId: "bitcoin", source: "y", price: 1, size: 1, ts: T0 + 59_000 }, T0 + 62_000);
  out = b.drain(T0 + 125_000); // minute 1 is now over too
  assert.deepEqual(out.map((c) => c.ts), [T0 + 60_000]);
  b.add({ assetId: "bitcoin", source: "y", price: 1, size: 1, ts: T0 + 70_000 }, T0 + 125_000);
  assert.deepEqual(b.drain(T0 + 125_000), []);
});

test("MarketState: newest trade wins and asOf follows live feeds", () => {
  const s = new MarketState();
  s.addCoverage("coinbase", "bitcoin");
  assert.equal(s.get("bitcoin"), null); // covered but no trade yet

  s.alive("coinbase", T0);
  s.trade({ assetId: "bitcoin", source: "coinbase", price: 100, size: 1, ts: T0 });
  s.trade({ assetId: "bitcoin", source: "kraken", price: 99, size: 1, ts: T0 - 500 }); // older, ignored for price
  let lp = s.get("bitcoin")!;
  assert.equal(lp.p, 100);
  assert.deepEqual(lp.src, ["coinbase", "kraken"]);

  // No trades, but Coinbase keeps talking: the price stays confirmed.
  s.alive("coinbase", T0 + 45_000);
  assert.equal(s.get("bitcoin")!.asOf, T0 + 45_000);

  // Coinbase drops: asOf stops moving.
  s.down("coinbase");
  lp = s.get("bitcoin")!;
  assert.equal(lp.asOf, T0);

  assert.deepEqual(s.takeDirty().map((p) => p.id), ["bitcoin"]);
  assert.deepEqual(s.takeDirty(), []);
});

test("alerts use whichever of the exchange and CoinGecko prices is newer", () => {
  const s = new MarketState();
  s.addCoverage("coinbase", "bitcoin");
  s.alive("coinbase", T0);
  s.trade({ assetId: "bitcoin", source: "coinbase", price: 100, size: 1, ts: T0 });
  assert.equal(currentPrice(s, { asset_id: "bitcoin", ref_price: 90, metadata_ms: T0 - 60_000 }), 100);
  // Feed went quiet long ago; CoinGecko's later price wins.
  assert.equal(currentPrice(s, { asset_id: "bitcoin", ref_price: 90, metadata_ms: T0 + 600_000 }), 90);
  // No exchange quotes the coin at all.
  assert.equal(currentPrice(s, { asset_id: "pepe", ref_price: 0.00001, metadata_ms: T0 }), 0.00001);
});
