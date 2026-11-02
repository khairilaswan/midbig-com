import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoinMarket, parsePage } from "@/components/coin-market";
import { HomeTemplate, type HomeData } from "@/components/home-templates";
import { getSession } from "@/lib/auth";
import { joinedCommunities, listCommunities } from "@/lib/communities";
import { forumViewer, listTopics } from "@/lib/forum";
import { currentLook } from "@/lib/look";
import { getMarketPage, getMovers } from "@/lib/server";
import { categories, type Categories } from "@/lib/settings";
import { trendingTickers, weeklyLeaders } from "@/lib/social";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
  return page > 1
    ? { title: `Cryptocurrency prices by market cap, page ${page}`, alternates: { canonical: `/?page=${page}` } }
    : { alternates: { canonical: "/" } };
}

/**
 * The home page follows the look's template: the coin table (Markets), or
 * one of the community-first layouts. Later pages of the coin table are
 * always the table.
 */
export default async function Home({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  if (Number.isNaN(page)) notFound();
  const session = await getSession();
  const [on, { look }] = await Promise.all([categories(), currentLook(session?.user.id ?? null)]);
  if (look.template === "markets" || page > 1) {
    if (!on.crypto) return page > 1 ? notFound() : <CryptoOff stocks={on.stock} forex={on.forex} />;
    return <CoinMarket page={page} base="/" />;
  }
  return <HomeTemplate template={look.template} data={await homeData(on)} />;
}

async function homeData(on: Categories): Promise<HomeData> {
  const { viewer, me } = await forumViewer();
  const cls = on.crypto ? "crypto" : on.stock ? "stock" : on.forex ? "forex" : null;
  const [market, movers, hot, fresh, trending, leaders, popular, joined] = await Promise.all([
    cls ? getMarketPage(1, cls) : null,
    cls ? getMovers(5, cls) : null,
    listTopics({ sort: "hot", limit: 15, viewerId: viewer?.id }),
    listTopics({ sort: "new", limit: 20, viewerId: viewer?.id }),
    trendingTickers(10),
    weeklyLeaders(10),
    listCommunities({ sort: "members", limit: 12 }),
    viewer ? joinedCommunities(viewer.id) : [],
  ]);
  return {
    me,
    signedIn: viewer != null,
    assets: market?.rows ?? [],
    movers,
    hot: hot.topics,
    fresh: fresh.topics,
    trending,
    leaders,
    popular,
    joined,
  };
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
