import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { lookVars, mediaUrl, type MediaType } from "@midbig/shared";
import { AccountMenu } from "@/components/account-menu";
import { LiveConnection } from "@/components/live";
import { CookieBanner } from "@/components/privacy";
import { RegisterServiceWorker } from "@/components/register-sw";
import { SearchBox } from "@/components/search-box";
import { getSession } from "@/lib/auth";
import { currentLook } from "@/lib/look";
import { pool } from "@/lib/server";
import { categories } from "@/lib/settings";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { unreadCount } from "@/lib/social";
import "./globals.css";
import "./social.css";
import "./themes.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Crypto, stock and forex prices, charts and market caps | midbig",
    template: "%s | midbig",
  },
  description:
    "Live prices for the top 500 cryptocurrencies, S&P 500 stocks and major forex pairs, with market caps, charts and the day's biggest movers.",
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  openGraph: { siteName: SITE_NAME, type: "website" },
};

// The header follows the admin's category switches, so every page renders per request.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

/** The header's view of the signed-in member: name, photo and unread notifications. */
async function headerMe(userId: string, email: string) {
  const [u, unread] = await Promise.all([
    pool().query<{ chat_name: string | null; avatar_id: string | null; mime: MediaType | null }>(
      `SELECT chat_name, avatar_id, (SELECT mime FROM media m WHERE m.id = avatar_id AND m.status = 'visible') AS mime FROM "user" WHERE id = $1`,
      [userId],
    ),
    unreadCount(userId).catch(() => 0),
  ]);
  const r = u.rows[0];
  return {
    name: r?.chat_name ?? email,
    email,
    avatar: r?.avatar_id && r.mime ? mediaUrl(r.avatar_id, r.mime) : null,
    unread,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const [on, { look }, me] = await Promise.all([
    categories(),
    currentLook(session?.user.id ?? null),
    session ? headerMe(session.user.id, session.user.email) : null,
  ]);
  const vars = lookVars(look);
  return (
    <html
      lang="en-US"
      data-style={look.style}
      data-mode={look.mode}
      data-template={look.template}
      style={vars as React.CSSProperties}
    >
      <body>
        <LiveConnection url={process.env.PUBLIC_WS_URL ?? null} />
        <RegisterServiceWorker />
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="brand" aria-label="midbig home">
              mid<span>big</span>
            </Link>
            <nav className="nav">
              <Link href="/forum">Communities</Link>
              {on.crypto && <Link href="/coins">Coins</Link>}
              {on.stock && <Link href="/stocks">Stocks</Link>}
              {on.forex && <Link href="/forex">Forex</Link>}
              {on.crypto && <Link href="/gainers-losers">Movers</Link>}
              <Link href="/watchlist">Watchlist</Link>
              <Link href="/portfolio">Portfolio</Link>
              <Link href="/what-if">What if</Link>
              <Link href="/chat">Chat</Link>
            </nav>
            <SearchBox />
            <AccountMenu me={me} />
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              <strong>Not financial advice.</strong> Prices and data are for information only and may be delayed or
              wrong. Do your own research before you trade.
            </p>
            <p className="muted">
              Crypto prices from Coinbase and Kraken, market data from{" "}
              <a href="https://www.coingecko.com" rel="noopener" target="_blank">
                CoinGecko
              </a>
              . Stock and forex data from{" "}
              <a href="https://finnhub.io" rel="noopener" target="_blank">
                Finnhub
              </a>
              ; stock prices are US exchange trades. A price is marked &ldquo;Delayed&rdquo; when no source has confirmed
              it in the last 60 seconds while its market is open.
            </p>
            <p className="footer-links">
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/rules">Community rules</Link>
              <Link href="/settings/appearance">Appearance</Link>
              <Link href="/privacy-choices">Do Not Sell or Share My Personal Information</Link>
            </p>
            <p className="muted">© {new Date().getFullYear()} midbig.com</p>
          </div>
        </footer>
        <CookieBanner />
      </body>
    </html>
  );
}
