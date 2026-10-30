# midbig.com

Live crypto prices, charts and market caps, built to run on one small server.
This is Phase 1 of the MVP plan: crypto only, with forex and US stocks to follow.

## How it works

```
Coinbase WS ─┐                      ┌─ Redis hash "prices" ─── web (Next.js) renders pages
Kraken WS ───┼─ prices service ─────┤
CoinGecko ───┘   (Node)             ├─ Redis pub/sub "ticks" ─ /ws gateway ─ browsers (live updates)
                                    └─ Postgres + TimescaleDB (assets, 1-minute candles, history)
```

- **apps/prices** is one Node process that:
  - pulls the top 500 coins (market cap, supply, logos, 7-day sparkline) from CoinGecko every 15 minutes,
  - holds one WebSocket each to Coinbase and Kraken and subscribes to every USD market for those coins,
  - keeps the latest trade price per coin and writes it to Redis once a second,
  - builds 1-minute OHLCV candles and stores them in TimescaleDB (rolled up hourly and daily),
  - backfills a year of daily closes per coin from CoinGecko, once,
  - serves the browser WebSocket at `/ws` and a health check at `/ws/health`.
- **apps/web** is the Next.js site: the ranked coin list with pagination, a page per coin with stats and a chart,
  gainers and losers, search, `sitemap.xml` and `robots.txt`. Pages render on the server from Postgres and Redis,
  then switch to the live stream in the browser.
- **packages/shared** has the types and number formatting both use.
- **db/migrations** is the schema. The price service applies new migrations on start.

### The 1-minute freshness rule

A price shows a green dot while an exchange connection that quotes the coin has spoken in the last 60 seconds.
No trade on a live connection means the last trade is still the price. If the feed goes quiet, the price turns
amber and says "Delayed · updated Xm ago". Coins that neither Coinbase nor Kraken lists show CoinGecko's price,
refreshed every 15 minutes, and are always marked delayed. `/ws/health` returns 503 when either feed has been
silent for more than 60 seconds, so an uptime monitor can alert on it.

## Run it locally

Needs Node 22, pnpm 10 and Docker.

Everything in Docker, against fake exchanges (no internet or API keys needed):

```sh
POSTGRES_PASSWORD=dev docker compose -f docker-compose.yml -f docker-compose.mock.yml up -d --build
open http://localhost:8000
```

Or run the apps directly for development:

```sh
pnpm install
pnpm --filter @midbig/shared build
docker run -d --name tsdb -e POSTGRES_USER=midbig -e POSTGRES_PASSWORD=midbig -e POSTGRES_DB=midbig \
  -p 5432:5432 timescale/timescaledb:2.17.2-pg16
docker run -d --name redis -p 6379:6379 redis:7-alpine
pnpm dev:prices                                   # real Coinbase, Kraken and CoinGecko
PUBLIC_WS_URL=ws://localhost:8080/ws pnpm dev:web # http://localhost:3000
```

To use the fake feeds instead, run `pnpm dev:mock` and start the price service with
`COINGECKO_BASE_URL=http://localhost:9100/api/v3 COINBASE_REST_URL=http://localhost:9100 COINBASE_WS_URL=ws://localhost:9101 KRAKEN_WS_URL=ws://localhost:9102`.

Checks: `pnpm typecheck` and `pnpm test`.

To run the real site on your own computer for testing, see [docs/run-on-your-computer.md](docs/run-on-your-computer.md).

## Deploy to one server

The stack is sized for a 2 vCPU / 4 GB VPS (for example a Hetzner Cloud server in Ashburn, Virginia).

1. Create the server with Ubuntu 24.04 and install Docker (`curl -fsSL https://get.docker.com | sh`).
2. In Cloudflare, point `midbig.com` and `www.midbig.com` (A records) at the server, proxied, with SSL mode
   **Full (strict)**.
3. On the server:
   ```sh
   git clone https://github.com/khairilaswan/midbig-com.git && cd midbig-com
   cp .env.example .env   # set POSTGRES_PASSWORD and COINGECKO_API_KEY
   docker compose up -d --build
   ```
   Caddy gets the TLS certificate by itself on first start.
4. Add an UptimeRobot monitor on `https://midbig.com/ws/health` (keyword `"ok":true`).
5. Submit `https://midbig.com/sitemap.xml` in Google Search Console.

To update: `git pull && docker compose up -d --build`.

## Configuration

Set in `.env` (see `.env.example`). The price service also reads these optional variables:

| Variable | Default | What it does |
| --- | --- | --- |
| `COINGECKO_TOP_N` | 500 | Number of coins tracked, by market cap |
| `COINGECKO_SYNC_MINUTES` | 15 | Minutes between market data refreshes (about 5,800 calls a month at 500 coins) |
| `COINGECKO_BACKFILL_DAYS` | 365 | Days of daily history fetched once per coin |
| `COINBASE_ENABLED`, `KRAKEN_ENABLED` | true | Turn a feed off |
