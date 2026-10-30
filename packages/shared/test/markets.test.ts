import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetClassOf,
  assetPath,
  expectsLivePrice,
  formatAssetPrice,
  forexId,
  forexStatus,
  idFromSlug,
  newYorkTime,
  stockId,
  usStockStatus,
} from "../src/index.ts";

/** A New York wall-clock time in late October 2026 (EDT, UTC-4). */
const ny = (day: number, h: number, m = 0) => Date.UTC(2026, 9, day, h + 4, m);

test("asset ids and paths", () => {
  assert.equal(stockId("BRK.B"), "stock-brk-b");
  assert.equal(forexId("EUR", "USD"), "fx-eur-usd");
  assert.equal(assetClassOf("bitcoin"), "crypto");
  assert.equal(assetClassOf("stock-aapl"), "stock");
  assert.equal(assetClassOf("fx-eur-usd"), "forex");
  assert.equal(assetPath("bitcoin"), "/coins/bitcoin");
  assert.equal(assetPath("stock-brk-b"), "/stocks/brk-b");
  assert.equal(assetPath("fx-usd-jpy"), "/forex/usd-jpy");
  assert.equal(idFromSlug("stock", "AAPL"), "stock-aapl");
  assert.equal(idFromSlug("forex", "eur-usd"), "fx-eur-usd");
});

test("newYorkTime follows daylight saving", () => {
  assert.deepEqual(newYorkTime(Date.UTC(2026, 9, 30, 13, 30)), { date: "2026-10-30", weekday: 5, minutes: 9 * 60 + 30 });
  // After clocks go back on Nov 1 2026, New York is UTC-5.
  assert.equal(newYorkTime(Date.UTC(2026, 10, 2, 14, 30)).minutes, 9 * 60 + 30);
});

test("US stock market sessions", () => {
  assert.equal(usStockStatus(ny(30, 9, 29)).phase, "pre");
  assert.equal(usStockStatus(ny(30, 9, 30)).phase, "open");
  assert.equal(usStockStatus(ny(30, 15, 59)).phase, "open");
  assert.equal(usStockStatus(ny(30, 16, 0)).phase, "after");
  assert.equal(usStockStatus(ny(30, 20, 0)).phase, "closed");
  assert.equal(usStockStatus(ny(31, 12)).phase, "closed"); // Saturday
  assert.equal(usStockStatus(Date.UTC(2026, 10, 26, 17)).phase, "closed"); // Thanksgiving
  // Day after Thanksgiving closes at 1 pm (EST, UTC-5).
  assert.equal(usStockStatus(Date.UTC(2026, 10, 27, 17, 59)).phase, "open");
  assert.equal(usStockStatus(Date.UTC(2026, 10, 27, 18, 0)).phase, "after");
});

test("forex runs Sunday 5 pm to Friday 5 pm New York time", () => {
  assert.equal(forexStatus(ny(30, 16, 59)).phase, "open");
  assert.equal(forexStatus(ny(30, 17, 0)).phase, "closed");
  assert.equal(forexStatus(ny(31, 12)).phase, "closed");
  assert.equal(forexStatus(Date.UTC(2026, 10, 1, 21, 59)).phase, "closed"); // Sun 4:59 pm EST
  assert.equal(forexStatus(Date.UTC(2026, 10, 1, 22, 0)).phase, "open");
  assert.equal(forexStatus(ny(28, 3)).phase, "open");
});

test("crypto always expects a live price", () => {
  assert.equal(expectsLivePrice("bitcoin", ny(31, 12)), true);
  assert.equal(expectsLivePrice("stock-aapl", ny(31, 12)), false);
});

test("formatAssetPrice: USD for stocks, plain rates for forex", () => {
  assert.equal(formatAssetPrice("stock-aapl", 231.5), "$231.50");
  assert.equal(formatAssetPrice("fx-eur-usd", 1.084523), "1.08452");
  assert.equal(formatAssetPrice("fx-usd-jpy", 151.2345), "151.235");
  assert.equal(formatAssetPrice("fx-eur-usd", null), "—");
});
