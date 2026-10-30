import { test } from "node:test";
import assert from "node:assert/strict";
import {
  botsCalled,
  buildTree,
  bullShare,
  chatNameProblem,
  communityLabel,
  communityRoom,
  defaultSlug,
  findMentions,
  hotRank,
  normalizeSlug,
  parseRoom,
  priceReply,
  pulseReply,
  riskFigures,
  riskReply,
  slugProblem,
  splitMentions,
  voteDelta,
  voteProblem,
  VOTE_LIMITS,
} from "../src/index.ts";

test("community names follow the asset", () => {
  assert.equal(defaultSlug("bitcoin"), "bitcoin");
  assert.equal(defaultSlug("stock-aapl"), "aapl");
  assert.equal(defaultSlug("stock-brk-b"), "brkb");
  assert.equal(defaultSlug("fx-eur-usd"), "eurusd");
  assert.equal(communityLabel({ ns: "b", slug: "aapl", assetClass: "stock", kind: "asset" }), "b/AAPL");
  assert.equal(communityLabel({ ns: "b", slug: "eurusd", assetClass: "forex", kind: "asset" }), "b/eurusd");
  assert.equal(communityLabel({ ns: "m", slug: "pepe", assetClass: "crypto", kind: "token" }), "m/pepe");
  assert.equal(communityLabel({ ns: "b", slug: "stocks", assetClass: "stock", kind: "hub" }), "b/stocks");
});

test("community names are tidied and checked", () => {
  assert.equal(normalizeSlug(" m/Pepe Coin! "), "pepe-coin");
  assert.equal(normalizeSlug("mb/litecoin"), "litecoin");
  const taken = new Set(["bitcoin", "aapl"]);
  assert.equal(slugProblem("pepe", taken), null);
  assert.ok(slugProblem("bitcoin", taken));
  assert.ok(slugProblem("admin", taken));
  assert.ok(slugProblem("midbig-official", taken));
  assert.ok(slugProblem("x", taken));
  assert.ok(slugProblem("-bad", taken));
});

test("hot rank: votes on a log scale, age costs", () => {
  const t = Date.UTC(2026, 9, 1);
  assert.ok(hotRank(10, t) > hotRank(1, t));
  assert.ok(hotRank(-5, t) < hotRank(0, t));
  // Ten times the votes is worth 12.5 hours.
  assert.ok(Math.abs(hotRank(100, t) - hotRank(10, t + 45000_000)) < 1e-9);
  assert.ok(hotRank(1, t + 3600_000) > hotRank(1, t));
});

test("votes: deltas and who may vote", () => {
  assert.deepEqual(voteDelta(0, 1), { ups: 1, downs: 0, score: 1 });
  assert.deepEqual(voteDelta(1, -1), { ups: -1, downs: 1, score: -2 });
  assert.deepEqual(voteDelta(-1, 0), { ups: 0, downs: -1, score: 1 });
  assert.deepEqual(voteDelta(1, 1), { ups: 0, downs: 0, score: 0 });
  const now = Date.now();
  const fresh = { createdAt: now - 1000, isStaff: false };
  const twoDays = { createdAt: now - 2 * 24 * 3600_000, isStaff: false };
  const old = { createdAt: now - VOTE_LIMITS.downMinAgeMs - 1, isStaff: false };
  assert.ok(voteProblem(fresh, 1, now));
  assert.equal(voteProblem(fresh, 0, now), null);
  assert.equal(voteProblem(twoDays, 1, now), null);
  assert.ok(voteProblem(twoDays, -1, now));
  assert.equal(voteProblem(old, -1, now), null);
  assert.equal(voteProblem({ ...fresh, isStaff: true }, -1, now), null);
});

test("comment trees sort siblings and keep orphans", () => {
  const c = (id: string, parentId: string | null, score: number, createdAt: number) => ({ id, parentId, score, createdAt });
  const items = [c("a", null, 1, 1), c("b", null, 5, 2), c("a1", "a", 0, 3), c("a2", "a", 3, 4), c("x", "gone", 0, 5)];
  const best = buildTree(items);
  assert.deepEqual(best.map((n) => n.id), ["b", "a", "x"]);
  assert.deepEqual(best[1]!.children.map((n) => n.id), ["a2", "a1"]);
  assert.deepEqual(buildTree(items, "new").map((n) => n.id), ["x", "b", "a"]);
  assert.deepEqual(buildTree(items, "old").map((n) => n.id), ["a", "b", "x"]);
});

test("$TICKER tags and @mentions", () => {
  const parts = splitMentions("Long $btc and $BRK.B. Cost $100, ask @pricebot, mail a@b.com https://x.com/$ETH");
  assert.deepEqual(
    parts.filter((p) => p.kind !== "text"),
    [
      { kind: "ticker", symbol: "BTC", text: "$btc" },
      { kind: "ticker", symbol: "BRK.B", text: "$BRK.B" },
      { kind: "user", name: "pricebot", text: "@pricebot" },
      { kind: "link", url: "https://x.com/$ETH" },
    ],
  );
  assert.equal(parts.map((p) => ("text" in p ? p.text : p.url)).join(""), "Long $btc and $BRK.B. Cost $100, ask @pricebot, mail a@b.com https://x.com/$ETH");
  assert.deepEqual(findMentions("$eth $ETH @Riskbot @riskbot"), { tickers: ["ETH"], users: ["Riskbot"] });
});

test("bots: who is called, and names kept for them", () => {
  assert.deepEqual(botsCalled("@PriceBot $AAPL and @riskbot @pricebot @nobody", ["pricebot", "riskbot", "pulsebot"]), ["pricebot", "riskbot"]);
  assert.deepEqual(botsCalled("@a @pricebot @riskbot @pulsebot", ["pricebot", "riskbot", "pulsebot"]).length, 2);
  assert.ok(chatNameProblem("NewsBot", []));
  assert.ok(chatNameProblem("cool_bot_2", []));
  assert.equal(chatNameProblem("robotics_fan", []), null);
});

test("bot replies", () => {
  const btc = {
    id: "bitcoin",
    name: "Bitcoin",
    symbol: "BTC",
    price: 100_000,
    ref24h: 95_000,
    ref7d: null,
    marketCap: 2e12,
    rank: 1,
    volume24h: 5e10,
    details: {},
    ath: 110_000,
  };
  const r = priceReply(btc);
  assert.match(r, /Bitcoin \(BTC\) is at \$100,000/);
  assert.match(r, /\+5\.26% in 24h/);
  assert.match(r, /#1/);
  assert.match(priceReply({ ...btc, price: null }), /don't have a price/);

  assert.equal(riskFigures(["d"], [1]), null);
  assert.match(riskReply(btc, null), /isn't enough price history/);
  const days = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  const closes = days.map((_, i) => (i === 20 ? 80 : 100));
  const f = riskFigures(days, closes)!;
  assert.ok(Math.abs(f.maxDrawdown + 0.2) < 1e-9);
  assert.equal(f.drawdownTo, days[20]);
  assert.equal(f.worstDay!.day, days[20]);
  assert.ok(f.vol1y! > 0);
  assert.match(riskReply(btc, f), /biggest fall from a high was -?20/);

  assert.match(pulseReply({ community: "b/bitcoin", topics: 0, comments: 0, bulls: 0, bears: 0, top: null, tickers: [] }), /quiet/);
  assert.match(
    pulseReply({ community: "b/bitcoin", topics: 2, comments: 5, bulls: 3, bears: 1, top: { title: "Halving", score: 7 }, tickers: [{ symbol: "BTC", n: 4 }] }),
    /75% bulls.*"Halving" \(\+7\).*\$BTC \(4\)/,
  );
});

test("sentiment needs a few calls", () => {
  assert.equal(bullShare(1, 1), null);
  assert.equal(bullShare(3, 1), 75);
  assert.equal(bullShare(0, 3), 0);
});

test("community chat rooms", () => {
  assert.equal(communityRoom(12), "c:12");
  assert.deepEqual(parseRoom("c:12"), { kind: "community", communityId: "12" });
  assert.equal(parseRoom("c:abc"), null);
});
