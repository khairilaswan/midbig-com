import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { coinRoom, formatAssetPrice, idFromSlug } from "@midbig/shared";
import { ForexHeader } from "@/components/asset-header";
import { ChatRoom } from "@/components/chat";
import { AssetDiscussions } from "@/components/forum-list";
import { PriceChart } from "@/components/price-chart";
import { WatchButton } from "@/components/watch-button";
import { getSession } from "@/lib/auth";
import { getAsset } from "@/lib/server";
import { listTopics } from "@/lib/forum";
import { isWatched } from "@/lib/user-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ pair: string }> };

async function load(slug: string) {
  const asset = await getAsset(idFromSlug("forex", slug));
  return asset?.assetClass === "forex" ? asset : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const asset = await load((await params).pair);
  if (!asset) return { title: "Currency pair not found" };
  const rate = asset.live?.p ?? asset.refPrice;
  return {
    title: `${asset.symbol} exchange rate today, live chart`,
    description: `Live ${asset.symbol} rate${rate ? ` (${formatAssetPrice(asset.id, rate)})` : ""}: ${asset.name}, with the 24-hour change and a price chart.`,
    alternates: { canonical: `/forex/${(await params).pair.toLowerCase()}` },
    robots: rate == null ? { index: false } : undefined,
  };
}

export default async function ForexPairPage({ params }: Props) {
  const [asset, session] = await Promise.all([load((await params).pair), getSession()]);
  if (!asset) notFound();
  const [watched, discussions] = await Promise.all([
    session ? isWatched(session.user.id, asset.id) : false,
    listTopics({ assetId: asset.id, limit: 5 }),
  ]);

  return (
    <article className="coin">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/forex">Forex</Link> <span aria-hidden>›</span> <span>{asset.symbol}</span>
      </nav>
      <ForexHeader asset={asset} />
      <div className="coin-actions">
        <WatchButton assetId={asset.id} name={asset.symbol} initial={watched} signedIn={!!session} />
        <Link href={`/alerts?coin=${asset.id}`} className="btn secondary small">
          🔔 Rate alert
        </Link>
      </div>
      <PriceChart id={asset.id} initialLive={asset.live} />
      <ChatRoom room={coinRoom(asset.id)} title={`${asset.symbol} chat`} />
      <AssetDiscussions topics={discussions.topics} asset={asset} />
      <section className="about">
        <h2>About the {asset.symbol} rate</h2>
        <p>
          The {asset.symbol} rate on midbig is the latest OANDA quote, streamed from Finnhub. Forex trades around the
          clock from Sunday 5 pm to Friday 5 pm New York time; on weekends the page shows Friday&rsquo;s last rate and
          says the market is closed.
        </p>
      </section>
    </article>
  );
}
