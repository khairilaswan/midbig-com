import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketTable, MoverList } from "@/components/market";
import { getMarketPage, getMovers, PAGE_SIZE } from "@/lib/server";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
  const { total } = await getMarketPage(1, "stock");
  return {
    title: page > 1 ? `S&P 500 stock prices, page ${page}` : "S&P 500 stock prices today, ranked by market cap",
    description:
      "Live prices for every S&P 500 stock, ranked by market cap, with today's change, P/E, dividend yield and charts.",
    alternates: { canonical: page > 1 ? `/stocks?page=${page}` : "/stocks" },
    robots: total === 0 ? { index: false } : undefined,
  };
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : NaN;
}

export default async function StocksPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  if (Number.isNaN(page)) notFound();
  const [{ rows, total }, movers] = await Promise.all([
    getMarketPage(page, "stock"),
    page === 1 ? getMovers(5, "stock") : null,
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) notFound();
  const priced = rows.some((r) => r.refPrice != null || r.live != null);

  return (
    <>
      <h1 className="page-title">S&amp;P 500 stock prices</h1>
      {total === 0 ? (
        <p className="empty">US stock prices are coming soon. Crypto prices are live now on the Coins page.</p>
      ) : (
        <>
          <p className="lede">
            Every stock in the S&amp;P 500, ranked by market cap. Prices update live during market hours (9:30 am to
            4:00 pm New York time) and are marked delayed when they are more than a minute old.
          </p>
          {movers && (movers.gainers.length > 0 || movers.losers.length > 0) && (
            <div className="mover-cards">
              <section className="card">
                <h2>Top gainers today</h2>
                <MoverList rows={movers.gainers} />
              </section>
              <section className="card">
                <h2>Top losers today</h2>
                <MoverList rows={movers.losers} />
              </section>
            </div>
          )}
          {!priced && <p className="muted">Prices are loading for the first time; this takes a few minutes.</p>}
          <MarketTable rows={rows} kind="stock" />
          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link key={p} href={p === 1 ? "/stocks" : `/stocks?page=${p}`} aria-current={p === page ? "page" : undefined}>
                  {p}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
    </>
  );
}
