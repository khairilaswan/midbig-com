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

Until the pull request is merged, switch to its branch:

```sh
git checkout claude/project-thread-f9lfyg
```

## 3. Create the settings file (one time)

Create a file called `.env` in the `midbig-com` folder with:

```
POSTGRES_PASSWORD=pick-any-long-password
COINGECKO_API_KEY=
```

The CoinGecko key is optional. Without it, the first load of coin history is
slower. You can get a free Demo key at https://www.coingecko.com/en/api/pricing
and paste it after the `=` later.

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
