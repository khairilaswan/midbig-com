import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { coinRoom, formatUsd, idFromSlug } from "@midbig/shared";
import { StockHeader } from "@/components/asset-header";
import { ChatRoom } from "@/components/chat";
import { AssetDiscussions } from "@/components/forum-list";
import { PriceChart } from "@/components/price-chart";
import { WatchButton } from "@/components/watch-button";
import { getSession } from "@/lib/auth";
import { getAsset } from "@/lib/server";
import { listTopics } from "@/lib/forum";
import { isWatched } from "@/lib/user-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ symbol: string }> };

async function load(slug: string) {
  const asset = await getAsset(idFromSlug("stock", slug));
  return asset?.assetClass === "stock" ? asset : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const asset = await load((await params).symbol);
  if (!asset) return { title: "Stock not found" };
  const price = asset.live?.p ?? asset.refPrice;
  return {
    title: `${asset.name} (${asset.symbol}) stock price today, live chart`,
    description: `${asset.name} (${asset.symbol}) stock price${price ? ` (${formatUsd(price)})` : ""}, today's change, market cap, P/E ratio, dividend yield and price chart.`,
    alternates: { canonical: `/stocks/${(await params).symbol.toLowerCase()}` },
    robots: price == null ? { index: false } : undefined,
  };
}

export default async function StockPage({ params }: Props) {
  const [asset, session] = await Promise.all([load((await params).symbol), getSession()]);
  if (!asset) notFound();
  const [watched, discussions] = await Promise.all([
    session ? isWatched(session.user.id, asset.id) : false,
    listTopics({ assetId: asset.id, limit: 5 }),
  ]);

  return (
    <article className="coin">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/stocks">Stocks</Link> <span aria-hidden>›</span> <span>{asset.name}</span>
      </nav>
      <StockHeader asset={asset} />
      <div className="coin-actions">
        <WatchButton assetId={asset.id} name={asset.name} initial={watched} signedIn={!!session} />
        <Link href={`/portfolio?add=${asset.id}`} className="btn secondary small">
          + Add to portfolio
        </Link>
        <Link href={`/alerts?coin=${asset.id}`} className="btn secondary small">
          🔔 Price alert
        </Link>
      </div>
      <PriceChart id={asset.id} initialLive={asset.live} />
      <ChatRoom room={coinRoom(asset.id)} title={`${asset.symbol} chat`} />
      <AssetDiscussions topics={discussions.topics} asset={asset} />
      <section className="about">
        <h2>About {asset.name} stock prices</h2>
        <p>
          The {asset.name} ({asset.symbol}) price on midbig is the last trade in US dollars, streamed from Finnhub
          during market hours. Outside 9:30 am to 4:00 pm New York time the page shows the last trade and says the
          market is closed. Today&rsquo;s change is measured from the previous close. Company figures (P/E, dividend
          yield, beta) refresh daily.
        </p>
      </section>
    </article>
  );
}
