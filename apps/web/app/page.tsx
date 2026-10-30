import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketTable, MoverList } from "@/components/market";
import { getMarketPage, getMovers, PAGE_SIZE } from "@/lib/server";
import { categories } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
  return page > 1
    ? { title: `Cryptocurrency prices by market cap, page ${page}`, alternates: { canonical: `/?page=${page}` } }
    : { alternates: { canonical: "/" } };
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : NaN;
}

export default async function Home({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  if (Number.isNaN(page)) notFound();
  const on = await categories();
  if (!on.crypto) return <CryptoOff stocks={on.stock} forex={on.forex} />;
  const [{ rows, total }, movers] = await Promise.all([getMarketPage(page), page === 1 ? getMovers(5) : null]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) notFound();

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

      {rows.length === 0 ? (
        <p className="empty">Market data is loading. Check back in a minute.</p>
      ) : (
        <MarketTable rows={rows} />
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={p === 1 ? "/" : `/?page=${p}`} aria-current={p === page ? "page" : undefined}>
              {p}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

/** The home page when an admin has switched crypto off. */
function CryptoOff({ stocks, forex }: { stocks: boolean; forex: boolean }) {
  return (
    <>
      <h1 className="page-title">Markets and trading communities</h1>
      <p className="lede">Prices, charts and a community for every asset.</p>
      <ul className="category-grid">
        {stocks && (
          <li>
            <Link href="/stocks" className="category-card">
              <strong>Stocks</strong>
              <span className="muted small">S&amp;P 500 prices, ranked by market cap.</span>
            </Link>
          </li>
        )}
        {forex && (
          <li>
            <Link href="/forex" className="category-card">
              <strong>Forex</strong>
              <span className="muted small">Major and cross currency pairs.</span>
            </Link>
          </li>
        )}
        <li>
          <Link href="/forum" className="category-card">
            <strong>Communities</strong>
            <span className="muted small">Discuss with other traders.</span>
          </Link>
        </li>
      </ul>
    </>
  );
}
