import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { coinRoom, formatUsd } from "@midbig/shared";
import { ChatRoom } from "@/components/chat";
import { CoinHeader } from "@/components/coin-header";
import { PriceChart } from "@/components/price-chart";
import { WatchButton } from "@/components/watch-button";
import { getSession } from "@/lib/auth";
import { getAsset } from "@/lib/server";
import { isWatched } from "@/lib/user-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const asset = await getAsset((await params).id);
  if (!asset) return { title: "Coin not found" };
  const sym = asset.symbol;
  const price = asset.live?.p ?? asset.refPrice;
  return {
    title: `${asset.name} price today, ${sym} to USD live chart`,
    description: `Live ${asset.name} (${sym}) price${price ? ` (${formatUsd(price)})` : ""}, market cap, trading volume, supply and price chart. Updated in real time from Coinbase and Kraken.`,
    alternates: { canonical: `/coins/${asset.id}` },
    openGraph: { title: `${asset.name} (${sym}) price`, images: asset.image ? [asset.image] : undefined },
  };
}

export default async function CoinPage({ params }: Props) {
  const [asset, session] = await Promise.all([getAsset((await params).id), getSession()]);
  if (!asset) notFound();
  const watched = session ? await isWatched(session.user.id, asset.id) : false;

  return (
    <article className="coin">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Coins</Link> <span aria-hidden>›</span> <span>{asset.name}</span>
      </nav>
      <CoinHeader asset={asset} />
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
      <section className="about">
        <h2>About {asset.name} prices</h2>
        <p>
          The {asset.name} ({asset.symbol}) price on midbig is the last trade in US dollars on{" "}
          {asset.live ? asset.live.src.map((s) => s[0]!.toUpperCase() + s.slice(1)).join(" and ") : "major US exchanges"}
          . Market cap, supply and volume come from CoinGecko and refresh every 15 minutes; market cap moves with the
          live price in between.
        </p>
      </section>
    </article>
  );
}
