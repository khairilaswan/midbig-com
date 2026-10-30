# Run midbig on your own computer

This runs the whole site on your computer, with live prices from Coinbase and
Kraken and market data from CoinGecko. It's meant for testing before launch.
Public visitors should go to a proper server.

## 1. Install two programs (one time)

- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
  - Windows: accept the WSL 2 option during install, then restart.
  - Mac: pick the Apple chip or Intel download to match your Mac.
  - Open Docker Desktop once and wait until it says it is running.
- **Git**: https://git-scm.com/downloads (Macs usually have it already).

## 2. Download the code (one time)

Open a terminal (Windows: "Terminal" or "PowerShell"; Mac: "Terminal") and run:

```sh
git clone https://github.com/khairilaswan/midbig-com.git
cd midbig-com
```

To try changes before their pull request is merged, switch to its branch
(for Phase 5: `git checkout claude/project-thread-3uay73`), and back with
`git checkout main`.

## 3. Create the settings file (one time)

Create a file called `.env` in the `midbig-com` folder with:

```
POSTGRES_PASSWORD=pick-any-long-password
COINGECKO_API_KEY=
ADMIN_EMAILS=you@example.com
FINNHUB_API_KEY=
```

Put the email you sign up with after `ADMIN_EMAILS=`. That account becomes the
admin who runs the chat moderation queue.

The CoinGecko key is optional. Without it, the first load of coin history is
slower. You can get a free Demo key at https://www.coingecko.com/en/api/pricing
and paste it after the `=` later.

The Finnhub key turns on **Stocks** and **Forex**. Leave it empty for crypto
only. A free key from https://finnhub.io/register is fine on your own
computer (the free plan is for personal use; a public site needs a paid plan).
With the free key, all 30 forex pairs and the 20 biggest stocks should update live,
the other stocks refresh about every 10 minutes and show "Delayed", and charts
start empty and fill in from live trades, because a year of history is a paid
feature.

## 4. Start it

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

The first start takes a few minutes while it builds. Then open:

- **http://localhost:8000**: the site
- **http://localhost:8000/ws/health**: feed status. `"ok":true` means both exchanges are connected.

Prices should start moving within a few seconds. Charts fill in as the
1-minute candles build up. The 30-day and 1-year history downloads in the
background, one coin every few seconds, so it takes about 30 minutes to finish.

## Stocks and forex

With a Finnhub key set, **Stocks** lists the S&P 500 by market cap and
**Forex** lists 30 currency pairs. The first load takes about 30 minutes on
the free plan (three calls per stock, 50 a minute); prices appear as they load.

- Stocks trade 9:30 am to 4:00 pm New York time on weekdays (9:30 pm to 4:00
  am in Malaysia while the US is on summer time, 10:30 pm to 5:00 am in
  winter). Outside those hours a stock shows a grey **Market closed** with its
  last price, not "Delayed".
- Forex trades from Sunday 5 pm to Friday 5 pm New York time.
- Stocks can go in the portfolio, the what-if simulator (try "Stock market
  falls: S&P 500 −20%") and alerts. Forex pairs can be watched and alerted on,
  but not added to the portfolio yet.

## Accounts, portfolio and alerts

- Click **Sign up** at the top right and create an account with any email and
  password. Nothing is emailed, so the email doesn't have to be real while testing.
- **Portfolio**: add your buys and sells; value and profit update live.
- **What if**: pick a scenario such as "BTC drops to $70k". It works without an
  account too.
- **Alerts**: create one, then press **Turn on notifications on this device**
  and **Send a test**. Notifications work at http://localhost:8000 in Chrome,
  Edge and Firefox.
- **Forgot your password?** Until email is set up, the reset link is printed
  in the log. Run `docker compose logs web` and look for "Reset your midbig password".

## Chat and moderation

- **Chat** is in the top menu, and every coin page has its own room below the
  chart. Anyone can read; posting needs an account and a chat name.
- New accounts must wait 10 minutes before posting and 24 hours before posting
  links. Your admin account skips the wait.
- Try a scam message such as `DM me on telegram for 100x signals`. It shows
  only to you, marked "Only you can see this", and lands in the queue.
- **Moderation**: on your account page, set up **Two-factor login** with an
  authenticator app on your phone (Google Authenticator, Microsoft
  Authenticator), and save the backup codes. Then open
  http://localhost:8000/mod to approve or remove held and reported messages,
  ban people, and make friends moderators (they need two-factor login too).
- To test as a second person, open a private (incognito) window and sign up
  with another email.

## Forum, profiles and stress tests

- **Forum** is in the top menu. Start a topic with **Start a topic**, or from
  the **Start a topic** button under any coin, stock or forex page's chat, which
  links the topic to that page.
- The same waits apply as in chat (10 minutes before posting, 24 hours before
  links), plus one new topic every 2 minutes and one reply every 15 seconds.
  Accounts can mark posts **👍 Helpful** after their first day. Your admin
  account skips the waits.
- Try a scam reply such as `DM me on telegram for guaranteed returns`. It waits
  in the **Forum queue** on http://localhost:8000/mod.
- Click any name to see that member's profile, reputation and recent posts.
  Add a short bio on your account page under **Public name and profile**.
- As a moderator, the **⋯** button on a post can remove it, ban its author for
  24 hours, and pin or lock the topic.
- **Stress test**: open **What if**, add holdings (or try the example
  portfolio) and scroll to "Stress test: past crashes on today's holdings".
  Click an event to see it coin by coin.

### On your phone

Phones need an `https://` address for notifications and "Add to Home Screen",
so use the Cloudflare link from "show it to a friend" below. Open it on the
phone, log in, then:

- Android (Chrome): menu ⋮ > **Add to Home screen** (or **Install app**).
- iPhone (Safari): Share > **Add to Home Screen**, then open midbig from the
  Home Screen. iPhones only allow notifications from the Home Screen app.

The free Cloudflare link changes every time you start it, and each new link
needs notifications turned on again.

## Everyday commands

Run these from the `midbig-com` folder.

| What | Command |
| --- | --- |
| Stop (keeps the data) | `docker compose -f docker-compose.yml -f docker-compose.local.yml down` |
| Start again | `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d` |
| Get my latest changes | `git pull` then the start command with `--build` added |
| See the price feed log | `docker compose logs -f prices` |

## Keep it running

Prices only stay live while the computer is awake and online. If you want it
running all the time, turn off sleep while plugged in:

- Windows: Settings > System > Power > Screen and sleep > "Never" when plugged in.
- Mac: System Settings > Battery (or Energy) > prevent automatic sleeping.

## Optional: show it to a friend

Install `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
and run:

```sh
cloudflared tunnel --url http://localhost:8000
```

It prints a temporary `https://….trycloudflare.com` link that works while the
command runs. It needs no account, and your home IP address stays hidden. Stop
it with Ctrl+C.
