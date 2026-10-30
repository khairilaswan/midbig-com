import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import { LiveConnection } from "@/components/live";
import { CookieBanner } from "@/components/privacy";
import { RegisterServiceWorker } from "@/components/register-sw";
import { SearchBox } from "@/components/search-box";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body>
        <LiveConnection url={process.env.PUBLIC_WS_URL ?? null} />
        <RegisterServiceWorker />
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="brand" aria-label="midbig home">
              mid<span>big</span>
            </Link>
            <nav className="nav">
              <Link href="/">Coins</Link>
              <Link href="/stocks">Stocks</Link>
              <Link href="/forex">Forex</Link>
              <Link href="/gainers-losers">Movers</Link>
              <Link href="/watchlist">Watchlist</Link>
              <Link href="/portfolio">Portfolio</Link>
              <Link href="/what-if">What if</Link>
              <Link href="/chat">Chat</Link>
            </nav>
            <SearchBox />
            <AccountMenu />
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
