import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkMessage,
  checkTitle,
  HISTORICAL_EVENTS,
  isTrusted,
  nextLevel,
  repLevel,
  reputation,
  runScenario,
  slugify,
  topicPath,
  TRUSTED_MIN_AGE_MS,
  worstDrawdown,
} from "../src/index.ts";

test("slugs and topic paths", () => {
  assert.equal(slugify("Is BTC topping out?"), "is-btc-topping-out");
  assert.equal(slugify("  Café — résumé!! "), "cafe-resume");
  assert.equal(slugify("???"), "topic");
  assert.ok(slugify("a".repeat(100)).length <= 60);
  assert.equal(topicPath(42, "ETH vs SOL"), "/forum/t/42/eth-vs-sol");
});

test("titles are tidied and checked", () => {
  assert.deepEqual(checkTitle("  What   moves gold?  "), { title: "What moves gold?" });
  assert.ok("error" in checkTitle("short"));
  assert.ok("error" in checkTitle("x".repeat(121)));
  assert.ok("error" in checkTitle("BUY THIS COIN RIGHT NOW"));
});

test("forum posts may be longer than chat messages", () => {
  const long = "Here is my reasoning about position sizing. ".repeat(40);
  assert.equal(checkMessage(long, { canPostLinks: true }).action, "reject");
  assert.equal(checkMessage(long, { canPostLinks: true, maxLength: 10_000 }).action, "allow");
});

test("trusted members' links to unknown sites aren't held, scam links still are", () => {
  const ctx = { canPostLinks: true, trustedLinks: true };
  assert.equal(checkMessage("My notes are on somebank-research.com", ctx).action, "allow");
  assert.equal(checkMessage("My notes are on somebank-research.com", { canPostLinks: true }).action, "hold");
  assert.equal(checkMessage("join t.me/pumpgroup", ctx).action, "hold");
  assert.equal(checkMessage("verify at coinbase-verify.xyz", ctx).action, "hold");
});

test("reputation and levels", () => {
  assert.equal(reputation(0, 0), 0);
  assert.equal(reputation(30, 1), 20);
  assert.equal(reputation(3, 2), 0);
  assert.equal(repLevel(0), "Newcomer");
  assert.equal(repLevel(10), "Member");
  assert.equal(repLevel(249), "Trusted");
  assert.equal(repLevel(5000), "Veteran");
  assert.deepEqual(nextLevel(42), { name: "Trusted", needs: 8 });
  assert.equal(nextLevel(300), null);
  const now = Date.now();
  assert.equal(isTrusted(60, now - TRUSTED_MIN_AGE_MS - 1, now), true);
  assert.equal(isTrusted(60, now - 1000, now), false);
  assert.equal(isTrusted(10, 0, now), false);
});

test("historical events run through the simulator", () => {
  const positions = [
    { assetId: "bitcoin", symbol: "BTC", quantity: 1, price: 100_000, beta: 1 },
    { assetId: "dogecoin", symbol: "DOGE", quantity: 100_000, price: 0.2, beta: 1.5 },
    { assetId: "tether", symbol: "USDT", quantity: 1000, price: 1, stable: true },
    { assetId: "stock-aapl", symbol: "AAPL", quantity: 10, price: 200, beta: 1.2, assetClass: "stock" as const },
  ];
  const covid = HISTORICAL_EVENTS.find((e) => e.id === "covid-2020")!;
  const r = runScenario(positions, covid);
  const by = new Map(r.rows.map((x) => [x.assetId, x]));
  assert.equal(by.get("bitcoin")!.pct, -50);
  assert.equal(by.get("dogecoin")!.pct, -75);
  assert.equal(by.get("tether")!.pct, 0);
  assert.ok(Math.abs(by.get("stock-aapl")!.pct - -40.8) < 1e-9);

  const gfc = HISTORICAL_EVENTS.find((e) => e.id === "gfc-2008")!;
  const g = new Map(runScenario(positions, gfc).rows.map((x) => [x.assetId, x]));
  assert.equal(g.get("bitcoin")!.pct, 0);
  assert.ok(g.get("stock-aapl")!.pct < -60);
  for (const e of HISTORICAL_EVENTS) assert.ok(e.label && e.period && e.description, e.id);
});

test("worst drawdown of today's holdings over stored closes", () => {
  const days = ["d0", "d1", "d2", "d3", "d4", "d5"];
  const closes = {
    a: [100, 120, 90, 60, 80, 130],
    b: [null, null, 10, 10, 10, 10],
  };
  const dd = worstDrawdown(new Map([["a", 1], ["b", 2]]), days, closes)!;
  // Values: 120, 140, 110, 80, 100, 150 (b counts at its first close before it has data).
  assert.ok(Math.abs(dd.pct - (1 - 80 / 140) * 100) < 1e-9);
  assert.equal(dd.peakDay, "d1");
  assert.equal(dd.troughDay, "d3");
  assert.equal(dd.recoveredDay, "d5");

  assert.equal(worstDrawdown(new Map([["a", 1]]), ["x", "y"], { a: [1, 2] }), null);
  assert.equal(worstDrawdown(new Map([["z", 1]]), days, closes), null);
});
