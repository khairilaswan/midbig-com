/**
 * Local stand-in for CoinGecko, Coinbase and Kraken, for development and
 * tests without network access. It speaks just enough of each protocol for
 * the price service: CoinGecko /coins/markets and /market_chart, Coinbase
 * /products plus the ticker/heartbeat feed, and Kraken v2 instrument/trade.
 *
 *   pnpm dev:mock    # HTTP on :9100, Coinbase WS on :9101, Kraken WS on :9102
 */
import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

const HTTP_PORT = Number(process.env.MOCK_HTTP_PORT ?? 9100);
const COINBASE_PORT = Number(process.env.MOCK_COINBASE_PORT ?? 9101);
const KRAKEN_PORT = Number(process.env.MOCK_KRAKEN_PORT ?? 9102);

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
