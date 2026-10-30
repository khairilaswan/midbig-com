# midbig.com

Live crypto prices, charts and market caps, built to run on one small server.
Phase 1 of the MVP plan is the price site; Phase 2 adds accounts, a watchlist, a
portfolio tracker, a what-if simulator, price alerts and an installable app;
Phase 3 adds live chat with a scam filter and moderation, two-factor login and
the legal pages needed to launch. Crypto only for now, with forex and US stocks
to follow.

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
- **packages/shared** has the types and number formatting both use, plus the portfolio maths (average cost
  profit and loss), the what-if simulator and risk figures, so they can be unit tested and run in the browser.
- **db/migrations** is the schema. The price service applies new migrations on start.

### Accounts and portfolio tools (Phase 2)

- **Accounts** use [Better Auth](https://www.better-auth.com) with email and password (and Google when
  `GOOGLE_CLIENT_ID` is set). Its tables are in `db/migrations/002_accounts.sql`, applied like the others.
  Sessions last 30 days.
- **Watchlist** (`/watchlist`): star coins from their page; the list shows live prices.
- **Portfolio** (`/portfolio`): buys and sells, valued live. Profit uses the average cost method, and a sell
  that would take a holding below zero is refused.
- **What if** (`/what-if`): presets such as "BTC drops to $70k" (round numbers about 20% from today's price),
  a market crash, a bear market and altcoin season, or your own moves. Other coins follow Bitcoin by their
  90-day beta; stablecoins (detected from price and volatility) stay put. A risk panel replays the last year's
  daily moves on today's holdings (95% one-day loss, worst day, concentration). Works without an account,
  saving holdings in the browser.
- **Price alerts** (`/alerts`): one-shot "above" or "below" alerts. The price service checks them every
  5 seconds against exchange prices (or CoinGecko's for coins no exchange lists) and sends a web push
  notification to every device the user turned notifications on for, plus an email when `RESEND_API_KEY`
  is set. The push key pair is generated on first use and stored in the `app_secrets` table.
- **Installable app**: `manifest.webmanifest`, icons and a service worker (`public/sw.js`) that shows
  notifications and an offline page. Pages are never cached, since prices must be fresh.

Both apps only share Postgres and Redis, so the site can move to Vercel later with the price service on a
small always-on server: the web app needs `DATABASE_URL`, `REDIS_URL`, `PUBLIC_WS_URL`, `SITE_URL` and
`BETTER_AUTH_SECRET`.

### Chat, moderation and launch pages (Phase 3)

- **Rooms**: one for everyone (`/chat`) and one on every coin page. Messages travel over the same `/ws`
  connection as prices: the web app checks and stores a message (`POST /api/chat`), publishes it on the Redis
  `chat` channel, and the gateway forwards it to browsers in that room. Reading needs no account.
- **Posting rules** (`packages/shared/src/chat.ts`): a chat name is picked before the first message, so emails
  never show; names that look like staff (`admin`, `midbig_support`, `Kha1` next to a moderator `Khai`) are
  refused. New accounts read for 10 minutes before posting and can't post links for 24 hours; everyone is
  limited to one message every 3 seconds and 200 an hour; repeats, all caps and spam floods are refused.
- **Scam filter**: wallet addresses, Telegram/WhatsApp/Discord invites (also spelled "t . me"), phone numbers,
  "DM me", promised returns, seed phrase talk, giveaways, staff impersonation, pump spam, link shorteners,
  lookalike domains (`coinbase-verify.xyz`) and links to sites off the allow list are **held**: stored, shown
  only to the author, and put in the moderation queue.
- **Reports and mutes**: the ⋯ menu on a message reports it (scam, spam, abuse, other) or mutes the person for
  you. Three reports hide a message until a moderator looks.
- **Moderation** (`/mod`): held and reported messages with the filter's reasons and the reports, plus approve,
  remove, remove and ban 24 hours, and ban for good. A ban also removes the person's last day of messages.
  Admins (from `ADMIN_EMAILS`) make moderators. The page and every moderator action need two-factor login on.
  The header line shows the launch gate: of the messages removed in the last week, how many the filter caught
  before anyone reported them.
- **Two-factor login**: authenticator app codes with backup codes and "trust this device for 30 days"
  (Better Auth's two-factor plugin), set up on the account page. It applies to password logins; Google logins
  rely on Google's own check.
- **Bot check**: Cloudflare Turnstile on sign-up and on each member's first chat message, when
  `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set.
- **Legal and privacy**: `/terms`, `/privacy` (US state laws, GDPR, PDPA), `/rules`, and `/privacy-choices`
  (the "Do Not Sell or Share" link, honouring Global Privacy Control), a cookie banner that records the
  visitor's choice for future ad or analytics scripts (`optionalCookiesAllowed()` in `components/privacy.tsx`),
  and "Download my data" on the account page. The texts are a starting point; have a lawyer read them before
  launch. Questions and takedowns go to `support@midbig.com` (`CONTACT_EMAIL` in `apps/web/lib/site.ts`).

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
   cp .env.example .env   # set POSTGRES_PASSWORD, BETTER_AUTH_SECRET and COINGECKO_API_KEY
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

Accounts and alerts (web and price service):

| Variable | Default | What it does |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | derived from the database URL | Signs login cookies. Set a random one before launch |
| `RESEND_API_KEY`, `EMAIL_FROM` | empty | Password reset and alert emails. Without a key, reset links go to the web log |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty | Adds "Continue with Google" |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | generated, stored in the database | Fixed web push keys, if you want them in config |

Chat (web):

| Variable | Default | What it does |
| --- | --- | --- |
| `ADMIN_EMAILS` | empty | Comma-separated emails whose accounts are admins (moderation queue, bans, making moderators) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | empty | Cloudflare Turnstile bot check on sign-up and first chat message |
