import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketTable, MoverList } from "./market";
import { getMarketPage, getMovers, PAGE_SIZE } from "@/lib/server";

/** The crypto price table with movers on page 1; `base` is where the pages live ("/" or "/coins"). */
export async function CoinMarket({ page, base }: { page: number; base: "/" | "/coins" }) {
  const [{ rows, total }, movers] = await Promise.all([getMarketPage(page), page === 1 ? getMovers(5) : null]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) notFound();
  const href = (p: number) => (p === 1 ? base : `${base}?page=${p}`);

  return (
    <>
      <h1 className="page-title">Cryptocurrency prices by market cap</h1>
      <p className="lede">
        Live prices for the top {total || 500} coins, streamed from Coinbase and Kraken and never more than a minute
        old. Anything older is marked delayed.
      </p>

      {movers && (movers.gainers.length > 0 || movers.losers.length > 0) && (
        <div className="mover-cards">
          <section className="card">
            <h2>
              Top gainers <Link href="/gainers-losers">See all</Link>
            </h2>
            <MoverList rows={movers.gainers} />
          </section>
          <section className="card">
            <h2>
              Top losers <Link href="/gainers-losers">See all</Link>
            </h2>
            <MoverList rows={movers.losers} />
          </section>
        </div>
      )}

      {rows.length === 0 ? <p className="empty">Market data is loading. Check back in a minute.</p> : <MarketTable rows={rows} />}

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={href(p)} aria-current={p === page ? "page" : undefined}>
              {p}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

export function parsePage(raw: string | undefined): number {
  const n = Number(raw ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : NaN;
}
