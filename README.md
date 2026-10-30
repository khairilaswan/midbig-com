# midbig.com

Live crypto, US stock and forex prices, charts and market caps, built to run on
one small server. Phase 1 of the MVP plan is the price site; Phase 2 adds
accounts, a watchlist, a portfolio tracker, a what-if simulator, price alerts
and an installable app; Phase 3 adds live chat with a scam filter and
moderation, two-factor login and the legal pages needed to launch; Phase 4 adds
S&P 500 stocks and 30 forex pairs, switched on by a Finnhub API key; Phase 5
adds the forum, public profiles with reputation, and historical stress tests;
Phase 6 turns the forum into communities (b/ for main assets, m/ for smaller
coins) with up and down votes, threaded comments, bots and an admin portal.

## How it works

```
Coinbase WS ─┐                      ┌─ Redis hash "prices" ─── web (Next.js) renders pages
Kraken WS ───┤                      │
CoinGecko ───┼─ prices service ─────┼─ Redis pub/sub "ticks" ─ /ws gateway ─ browsers (live updates)
Finnhub WS ──┤   (Node)             │
Finnhub REST ┘                      └─ Postgres + TimescaleDB (assets, 1-minute candles, history)
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

### Stocks and forex (Phase 4)

Off until `FINNHUB_API_KEY` is set; with it, the price service:

- puts the S&P 500 (`apps/prices/src/data/sp500.ts`, refresh it when the index changes) and 30 forex pairs
  (`FOREX_PAIRS` in `packages/shared/src/markets.ts`) in the `assets` table, with ids like `stock-aapl` and
  `fx-eur-usd`; pages live at `/stocks/aapl` and `/forex/eur-usd`;
- streams trades for as many symbols as the plan allows (`FINNHUB_WS_SYMBOLS`): every forex pair first, then the
  biggest stocks;
- walks the stock list in market cap order within `FINNHUB_CALLS_PER_MINUTE`: a quote for each (price, previous
  close, day range), plus the company profile and ratios (shares, logo, P/E, beta, dividend yield, 52-week range)
  once a day. Stocks off the stream use that quote and show "Delayed";
- reads all forex reference rates in one call every 5 minutes and works out each pair's 24-hour change from the
  stored candles;
- builds the 7-day sparkline and change for stocks and forex from its own hourly candles every 15 minutes;
- backfills a year of daily closes when the plan includes it (Finnhub's candles are a paid feature; on the free
  plan charts fill in from live trades).

Stocks show their change since the previous close ("Today"). Market hours and US holidays are in
`packages/shared/src/markets.ts` (update the holiday list each December): outside regular hours a stock is marked
"Market closed" with its last trade instead of "Delayed", and forex closes from Friday to Sunday 5 pm New York time.

Stocks work in the watchlist, portfolio, alerts and the what-if simulator, where they follow an S&P 500 move by
their published beta ("Stock market falls: S&P 500 −20%"). Forex pairs can be watched and alerted on; they stay out
of the portfolio because a rate isn't a dollar price.

The free Finnhub plan is for personal use. Before showing stock or forex prices to the public, move to a paid plan
whose licence allows display, then set `FINNHUB_CALLS_PER_MINUTE` and `FINNHUB_WS_SYMBOLS=600` to its limits.

### Forum, reputation and stress tests (Phase 5)

- **Forum** (`/forum`): six categories (`FORUM_CATEGORIES` in `packages/shared/src/forum.ts`), topics that can be
  linked to a coin, stock or forex pair (shown under its chat), "latest" and "most helpful this month" lists, and
  pages of 30 replies. Topics are server-rendered, marked up as `DiscussionForumPosting` and listed in the sitemap.
  Tables are in `db/migrations/005_community.sql`: `forum_topics`, `forum_posts` (the opening post and replies),
  `forum_votes` and `forum_reports`.
- **Same protection as chat**: posts, titles and edits go through the chat scam filter (`checkMessage`, with a longer
  length limit); held posts show only to their author and moderators. The chat waits apply (10 minutes to post,
  24 hours for links), plus one topic every 2 minutes (10 a day) and one reply every 15 seconds (100 a day). Members
  can edit a post in its first hour and delete their own posts. Three reports hide a post until a moderator looks.
  The first post of any kind needs the Turnstile check when it is set up.
- **Moderation**: `/mod` has a forum queue next to the chat queue. Moderators can remove posts and pin or lock
  topics from the topic page. A ban covers chat and the forum and removes the last day of both.
- **Reputation**: 👍 Helpful votes from accounts at least a day old earn the author a point each; each post a
  moderator removes costs 10. Levels are Newcomer, Member (10), Trusted (50 and a 30-day-old account) and
  Veteran (250). Trusted members' links to sites off the allow list post without waiting, and their reports count
  double. It is kept in `user.reputation` and recounted whenever a vote or removal touches someone.
- **Profiles** (`/u/<name>`): name, staff badge, level, bio (no links), counts and recent posts. Only Trusted
  members' profiles are open to search engines. Chat names link to profiles.
- **Historical stress tests** (on `/what-if`): eight past events, from the dot-com bust to FTX and the 2020–21
  bull run (`HISTORICAL_EVENTS` in `packages/shared/src/stress.ts`), replayed on today's holdings with the same
  simulator: Bitcoin, Ethereum, Solana and the S&P 500 use the event's peak-to-trough fall; other coins follow
  Bitcoin by today's beta and stocks follow the S&P 500. The panel also shows the worst peak-to-trough fall today's
  holdings would have had over the stored year of daily closes.

Not built yet from the plan's Phase 5: prediction leaderboards (need a lawyer's view first), AI summaries and
read-only exchange sync.

### Communities, votes, bots and the admin portal (Phase 6)

Phase 6 replaces Phase 5's six fixed forum categories with communities. Tables are in
`db/migrations/006_communities.sql`, which moves existing topics into communities on its first run; the pure rules
(names, hot rank, votes, comment trees, mentions, bot replies) are in `packages/shared/src/community.ts` and
`bots.ts`, with tests.

- **b/ and m/**: `b/` communities are for main assets and topic hubs and only admins create them: `b/bitcoin` (coin
  id), `b/AAPL` (stock ticker), `b/eurusd` (forex pair), plus hubs `b/general`, `b/crypto`, `b/stocks`, `b/forex`,
  `b/strategy` and `b/midbig`. `m/` communities are for smaller or unlisted coins and are made by **verified**
  members (up to 3 each), who become their moderators. A listed asset's name is kept for its b/ community. Each
  community has Forum, Chart, Chat and Info tabs (`/b/<name>?tab=chat`), members (Join), its own rules, and a
  bull/bear gauge from the last week's topic calls. Old `/forum/c/<category>` links redirect to the hubs; topic URLs
  are unchanged.
- **Votes**: ▲/▼ on topics and comments. Topics sort by Hot (Reddit-style: log of net votes plus age), New or Top
  (today to all time). Accounts vote after one day and downvote after three; 100 votes an hour. Reputation is now
  the net votes a member's posts received, minus 10 per removed post.
- **Threaded comments**: replies nest six deep, sort by Best, Newest or Oldest, fold, and fold themselves at -4.
- **$TICKER and @name**: `$BTC` in any post or chat message links to `/t/BTC`, which opens the asset's community;
  `@name` links to a profile.
- **Bots** are accounts with a Bot badge; members call them with `@handle` in a post, comment or chat message.
  `@pricebot` (price and key figures), `@riskbot` (volatility, worst fall, worst day from a year of daily closes) and
  `@pulsebot` (a community's last 24 hours) are built in and free. Admins can add more, including AI bots that answer
  with Claude when `ANTHROPIC_API_KEY` is set (`BOT_AI_MODEL` picks the model). Each bot has a daily cap and each
  member can call bots 20 times an hour. Code: `apps/web/lib/bots.ts`.
- **Admin portal** (`/admin`, admins with two-factor login): switch the Crypto, Stocks and Forex categories on or
  off (hides their pages, lists, search, communities and topics; nothing is deleted), create the default b/
  communities for the top coins, stocks and pairs in one click, suspend communities and pick their moderators,
  verify members, add and tune bots, and read the admin log. The chat and forum report queues stay on `/mod`.

Not built yet: payments and paid plans, and how members get verified (identity checks); both are on hold.

### The 1-minute freshness rule

A price shows a green dot while an exchange connection that quotes the coin has spoken in the last 60 seconds.
No trade on a live connection means the last trade is still the price. If the feed goes quiet, the price turns
amber and says "Delayed · updated Xm ago". Coins that neither Coinbase nor Kraken lists show CoinGecko's price,
refreshed every 15 minutes, and are always marked delayed. `/ws/health` returns 503 when any feed has been
silent for more than 60 seconds (Finnhub only counts while a stock or forex market is open), so an uptime monitor
can alert on it.

## Run it locally

Needs Node 22, pnpm 10 and Docker.

Everything in Docker, against fake exchanges, CoinGecko and Finnhub (no internet or API keys needed). The fake
stocks and forex only trade during real market hours; add `MOCK_MARKETS_ALWAYS_OPEN=true` to see them move at
night and on weekends:

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
`COINGECKO_BASE_URL=http://localhost:9100/api/v3 COINBASE_REST_URL=http://localhost:9100 COINBASE_WS_URL=ws://localhost:9101 KRAKEN_WS_URL=ws://localhost:9102`,
plus `FINNHUB_API_KEY=mock FINNHUB_BASE_URL=http://localhost:9100/finnhub/api/v1 FINNHUB_WS_URL=ws://localhost:9103`
for stocks and forex.

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
| `FINNHUB_API_KEY` | empty | Turns on S&P 500 stocks and forex |
| `FINNHUB_CALLS_PER_MINUTE` | 50 | REST calls a minute (free plan: 60) |
| `FINNHUB_WS_SYMBOLS` | 50 | Symbols on the live stream (free plan: 50; paid: set 600) |
| `FINNHUB_BACKFILL_DAYS` | 365 | Days of daily history fetched once per stock or pair (paid plans) |

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
