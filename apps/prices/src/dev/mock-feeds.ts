/**
 * Local stand-in for CoinGecko, Coinbase, Kraken and Finnhub, for development
 * and tests without network access. It speaks just enough of each protocol
 * for the price service: CoinGecko /coins/markets and /market_chart, Coinbase
 * /products plus the ticker/heartbeat feed, Kraken v2 instrument/trade, and
 * Finnhub's REST API (under /finnhub/api/v1) and trade stream.
 *
 *   pnpm dev:mock    # HTTP on :9100, Coinbase WS on :9101, Kraken WS on :9102, Finnhub WS on :9103
 */
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { forexStatus, FOREX_PAIRS, usStockStatus } from "@midbig/shared";
import { SP500 } from "../data/sp500.js";

const HTTP_PORT = Number(process.env.MOCK_HTTP_PORT ?? 9100);
const COINBASE_PORT = Number(process.env.MOCK_COINBASE_PORT ?? 9101);
const KRAKEN_PORT = Number(process.env.MOCK_KRAKEN_PORT ?? 9102);
const FINNHUB_PORT = Number(process.env.MOCK_FINNHUB_PORT ?? 9103);
/** Trade stocks and forex even when their real markets are closed, for testing at any hour. */
const ALWAYS_OPEN = process.env.MOCK_MARKETS_ALWAYS_OPEN === "true";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  supply: number;
  coinbase: boolean;
  kraken: boolean;
}

// A few well-known coins, then filler so lists and pagination have something to show.
const coins: Coin[] = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", price: 67000, supply: 19.8e6, coinbase: true, kraken: true },
  { id: "ethereum", symbol: "eth", name: "Ethereum", price: 3500, supply: 120e6, coinbase: true, kraken: true },
  { id: "tether", symbol: "usdt", name: "Tether", price: 1, supply: 120e9, coinbase: true, kraken: true },
  { id: "solana", symbol: "sol", name: "Solana", price: 170, supply: 470e6, coinbase: true, kraken: true },
  { id: "ripple", symbol: "xrp", name: "XRP", price: 0.55, supply: 56e9, coinbase: true, kraken: true },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin", price: 0.15, supply: 146e9, coinbase: true, kraken: true },
  { id: "cardano", symbol: "ada", name: "Cardano", price: 0.45, supply: 35e9, coinbase: true, kraken: true },
  { id: "chainlink", symbol: "link", name: "Chainlink", price: 14, supply: 600e6, coinbase: true, kraken: false },
  { id: "litecoin", symbol: "ltc", name: "Litecoin", price: 80, supply: 75e6, coinbase: false, kraken: true },
  { id: "binancecoin", symbol: "bnb", name: "BNB", price: 580, supply: 146e6, coinbase: false, kraken: false },
  { id: "shiba-inu", symbol: "shib", name: "Shiba Inu", price: 0.0000175, supply: 589e12, coinbase: true, kraken: true },
];
for (let i = 1; coins.length < 520; i++) {
  coins.push({
    id: `mock-token-${i}`,
    symbol: `mt${i}`,
    name: `Mock Token ${i}`,
    price: Number((50 / (i + 1)).toPrecision(4)),
    supply: 1e9 / (1 + i / 50),
    coinbase: i % 3 === 0,
    kraken: i % 4 === 0,
  });
}
const startPrice = new Map(coins.map((c) => [c.id, c.price]));

// Random walk; liquid coins trade often, filler rarely.
function step(c: Coin): void {
  c.price = Math.max(c.price * (1 + (Math.random() - 0.5) * 0.002), 1e-9);
}

function marketRow(c: Coin, rank: number) {
  const spark = Array.from({ length: 168 }, (_, i) => c.price * (1 + Math.sin(i / 12 + rank) * 0.05));
  return {
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    image: null,
    current_price: c.price,
    market_cap: c.price * c.supply,
    market_cap_rank: rank,
    fully_diluted_valuation: c.price * c.supply * 1.1,
    total_volume: c.price * c.supply * 0.03,
    circulating_supply: c.supply,
    total_supply: c.supply * 1.1,
    max_supply: c.id === "bitcoin" ? 21e6 : null,
    ath: c.price * 1.4,
    ath_date: "2025-03-14T00:00:00.000Z",
    atl: c.price * 0.01,
    atl_date: "2015-01-14T00:00:00.000Z",
    price_change_percentage_24h_in_currency: (c.price / startPrice.get(c.id)! - 1) * 100 + 1.5 - (rank % 5),
    price_change_percentage_7d_in_currency: 4 - (rank % 9),
    sparkline_in_7d: { price: spark },
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${HTTP_PORT}`);
  const json = (body: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname.startsWith("/finnhub/api/v1/")) return finnhubRest(url, json, res);
  if (url.pathname === "/api/v3/coins/markets") {
    const perPage = Number(url.searchParams.get("per_page") ?? 100);
    const page = Number(url.searchParams.get("page") ?? 1);
    const sorted = [...coins].sort((a, b) => b.price * b.supply - a.price * a.supply);
    return json(sorted.slice((page - 1) * perPage, page * perPage).map((c, i) => marketRow(c, (page - 1) * perPage + i + 1)));
  }
  const chart = url.pathname.match(/^\/api\/v3\/coins\/([^/]+)\/market_chart$/);
  if (chart) {
    const coin = coins.find((c) => c.id === decodeURIComponent(chart[1]!));
    if (!coin) return res.writeHead(404).end();
    const days = Number(url.searchParams.get("days") ?? 30);
    const now = Date.now();
    const prices: [number, number][] = [];
    for (let d = days; d >= 0; d--) {
      const t = Math.floor((now - d * 86400_000) / 86400_000) * 86400_000;
      prices.push([d === 0 ? now : t, coin.price * (1 + Math.sin(d / 20) * 0.2 - d / days / 3)]);
    }
    return json({
      prices,
      total_volumes: prices.map(([t, p]) => [t, p * coin.supply * 0.03]),
      market_caps: prices.map(([t, p]) => [t, p * coin.supply]),
    });
  }
  if (url.pathname === "/products") {
    return json(
      coins
        .filter((c) => c.coinbase)
        .map((c) => ({
          id: `${c.symbol.toUpperCase()}-USD`,
          base_currency: c.symbol.toUpperCase(),
          quote_currency: "USD",
          status: "online",
          trading_disabled: false,
        })),
    );
  }
  res.writeHead(404).end();
});
server.listen(HTTP_PORT, () => console.log(`mock HTTP (CoinGecko + Coinbase REST) on :${HTTP_PORT}`));

// Coinbase Exchange feed: ticker per trade, heartbeat per second.
const cb = new WebSocketServer({ port: COINBASE_PORT });
cb.on("connection", (ws: WebSocket) => {
  let products: string[] = [];
  let heartbeat: string[] = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type !== "subscribe") return;
    products = msg.product_ids ?? [];
    for (const ch of msg.channels ?? []) if (typeof ch === "object" && ch.name === "heartbeat") heartbeat = ch.product_ids;
    ws.send(JSON.stringify({ type: "subscriptions", channels: msg.channels }));
  });
  const timer = setInterval(() => {
    for (const id of heartbeat) {
      ws.send(JSON.stringify({ type: "heartbeat", product_id: id, sequence: 1, last_trade_id: 1, time: new Date().toISOString() }));
    }
    for (const pid of products) {
      const coin = coins.find((c) => `${c.symbol.toUpperCase()}-USD` === pid);
      if (!coin || Math.random() > (coin.id.startsWith("mock") ? 0.05 : 0.8)) continue;
      step(coin);
      ws.send(
        JSON.stringify({
          type: "ticker",
          product_id: pid,
          price: coin.price.toString(),
          last_size: (Math.random() * 2).toFixed(6),
          time: new Date().toISOString().replace("Z", "123Z"),
          side: "buy",
        }),
      );
    }
  }, 1000);
  ws.on("close", () => clearInterval(timer));
});
console.log(`mock Coinbase WS on :${COINBASE_PORT}`);

// Kraken v2: instrument snapshot, trade snapshot/updates, heartbeat.
const kr = new WebSocketServer({ port: KRAKEN_PORT });
kr.on("connection", (ws: WebSocket) => {
  const subscribed = new Set<string>();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method !== "subscribe") return;
    const channel = msg.params?.channel;
    ws.send(JSON.stringify({ method: "subscribe", success: true, result: { channel } }));
    if (channel === "instrument") {
      const pairs = coins.map((c) => ({
        symbol: `${c.symbol.toUpperCase()}/USD`,
        base: c.symbol.toUpperCase(),
        quote: "USD",
        status: c.kraken ? "online" : "delisted",
      }));
      pairs.push({ symbol: "BTC/EUR", base: "BTC", quote: "EUR", status: "online" });
      ws.send(JSON.stringify({ channel: "instrument", type: "snapshot", data: { assets: [], pairs } }));
    } else if (channel === "trade") {
      const snapshot = [];
      for (const s of msg.params.symbol as string[]) {
        subscribed.add(s);
        const coin = coins.find((c) => `${c.symbol.toUpperCase()}/USD` === s);
        if (coin) snapshot.push(trade(s, coin.price, Date.now() - 5 * 60_000));
      }
      ws.send(JSON.stringify({ channel: "trade", type: "snapshot", data: snapshot }));
    }
  });
  const timer = setInterval(() => {
    ws.send(JSON.stringify({ channel: "heartbeat" }));
    const data = [];
    for (const s of subscribed) {
      const coin = coins.find((c) => `${c.symbol.toUpperCase()}/USD` === s);
      if (!coin || Math.random() > (coin.id.startsWith("mock") ? 0.03 : 0.6)) continue;
      step(coin);
      data.push(trade(s, coin.price, Date.now()));
    }
    if (data.length > 0) ws.send(JSON.stringify({ channel: "trade", type: "update", data }));
  }, 1000);
  ws.on("close", () => clearInterval(timer));
});
console.log(`mock Kraken WS on :${KRAKEN_PORT}`);

function trade(symbol: string, price: number, ts: number) {
  return {
    symbol,
    side: "buy",
    price: Number(price.toPrecision(8)),
    qty: Number((Math.random() * 3).toFixed(5)),
    ord_type: "market",
    trade_id: Math.floor(Math.random() * 1e9),
    timestamp: new Date(ts).toISOString().replace("Z", "456Z"),
  };
}

// ---------------------------------------------------------------------------
// Finnhub: S&P 500 stocks and OANDA forex pairs.

interface Stock {
  ticker: string;
  price: number;
  prevClose: number;
  shares: number;
}

/** Stable pseudo-random number in [0, 1) from a string. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

const stocks = new Map<string, Stock>(
  SP500.map(([ticker]) => {
    const price = Number((20 + hash01(ticker) * 580).toFixed(2));
    return [ticker, { ticker, price, prevClose: Number((price * (1 + (hash01(ticker + "pc") - 0.5) * 0.04)).toFixed(2)), shares: (0.1 + hash01(ticker + "s") * 5) * 1e9 }];
  }),
);
const usdRates: Record<string, number> = {
  EUR: 0.92, JPY: 151.2, GBP: 0.79, CHF: 0.88, AUD: 1.52, CAD: 1.37, NZD: 1.66, MXN: 18.5, CNH: 7.2, HKD: 7.8,
  SGD: 1.34, ZAR: 18.2, TRY: 34.1, SEK: 10.6, NOK: 10.9, PLN: 4.0, THB: 35.5,
};
const pairRate = (base: string, quote: string) => (quote === "USD" ? 1 : usdRates[quote]!) / (base === "USD" ? 1 : usdRates[base]!);
const forexPrices = new Map(FOREX_PAIRS.map((p) => [`OANDA:${p.base}_${p.quote}`, pairRate(p.base, p.quote)]));

function finnhubRest(url: URL, json: (body: unknown) => void, res: http.ServerResponse): void {
  const path = url.pathname.slice("/finnhub/api/v1".length);
  const symbol = url.searchParams.get("symbol") ?? "";
  const stock = stocks.get(symbol);
  if (path === "/quote") {
    if (!stock) return json({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 });
    return json({
      c: stock.price,
      d: stock.price - stock.prevClose,
      dp: (stock.price / stock.prevClose - 1) * 100,
      h: Math.max(stock.price, stock.prevClose) * 1.01,
      l: Math.min(stock.price, stock.prevClose) * 0.99,
      o: stock.prevClose * 1.002,
      pc: stock.prevClose,
      t: Math.floor(Date.now() / 1000),
    });
  }
  if (path === "/stock/profile2") {
    if (!stock) return json({});
    return json({
      ticker: symbol,
      name: symbol,
      exchange: hash01(symbol + "x") > 0.5 ? "NASDAQ NMS - GLOBAL MARKET" : "NEW YORK STOCK EXCHANGE, INC.",
      logo: "",
      weburl: `https://www.example.com/${symbol.toLowerCase()}`,
      finnhubIndustry: "Technology",
      marketCapitalization: (stock.price * stock.shares) / 1e6,
      shareOutstanding: stock.shares / 1e6,
    });
  }
  if (path === "/stock/metric") {
    if (!stock) return json({ metric: {} });
    return json({
      metric: {
        "52WeekHigh": stock.price * 1.3,
        "52WeekLow": stock.price * 0.7,
        peTTM: 10 + hash01(symbol + "pe") * 40,
        beta: Number((0.5 + hash01(symbol + "b") * 1.3).toFixed(2)),
        currentDividendYieldTTM: hash01(symbol + "d") * 4,
        "10DayAverageTradingVolume": 1 + hash01(symbol + "v") * 30,
      },
    });
  }
  if (path === "/forex/rates") return json({ base: "USD", quote: usdRates });
  if (path === "/stock/candle" || path === "/forex/candle") {
    const base = stock?.price ?? forexPrices.get(symbol);
    if (base == null) return json({ s: "no_data" });
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    const t: number[] = [];
    const c: number[] = [];
    for (let day = Math.ceil(from / 86400); day * 86400 <= to; day++) {
      const wd = new Date(day * 86400_000).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      const left = (to - day * 86400) / 86400;
      t.push(day * 86400);
      c.push(base * (1 + Math.sin(left / 15 + hash01(symbol) * 6) * 0.08 - left / 1500));
    }
    return json({ s: "ok", t, c, v: c.map(() => 1e6) });
  }
  res.writeHead(404).end();
}

// Finnhub trade stream: trades only while each market is open, a ping every 5 seconds.
const fh = new WebSocketServer({ port: FINNHUB_PORT });
fh.on("connection", (ws: WebSocket) => {
  const subscribed = new Set<string>();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "subscribe" && typeof msg.symbol === "string") subscribed.add(msg.symbol);
    if (msg.type === "unsubscribe") subscribed.delete(msg.symbol);
  });
  let n = 0;
  const timer = setInterval(() => {
    if (++n % 5 === 0) ws.send(JSON.stringify({ type: "ping" }));
    const now = Date.now();
    const stocksOpen = ALWAYS_OPEN || usStockStatus(now).phase === "open";
    const fxOpen = ALWAYS_OPEN || forexStatus(now).phase === "open";
    const data = [];
    for (const s of subscribed) {
      const stock = stocks.get(s);
      if (stock && stocksOpen && Math.random() < 0.5) {
        stock.price = Number((stock.price * (1 + (Math.random() - 0.5) * 0.002)).toFixed(2));
        data.push({ s, p: stock.price, t: now, v: Math.floor(Math.random() * 500) + 1, c: ["1"] });
      }
      const fx = forexPrices.get(s);
      if (fx != null && fxOpen && Math.random() < 0.7) {
        const p = fx * (1 + (Math.random() - 0.5) * 0.0004);
        forexPrices.set(s, p);
        data.push({ s, p, t: now, v: 0 });
      }
    }
    if (data.length > 0) ws.send(JSON.stringify({ type: "trade", data }));
  }, 1000);
  ws.on("close", () => clearInterval(timer));
});
console.log(`mock Finnhub WS on :${FINNHUB_PORT}`);
