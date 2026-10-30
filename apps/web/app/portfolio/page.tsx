import type { Metadata } from "next";
import Link from "next/link";
import { PortfolioView } from "@/components/portfolio-view";
import { getSession } from "@/lib/auth";
import { getAssetRows, getTxns } from "@/lib/user-data";

export const metadata: Metadata = {
  title: "Crypto portfolio tracker with live profit and loss",
  description: "Track your crypto holdings with live prices, average cost and profit or loss. Free.",
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ add?: string }> };

export default async function PortfolioPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) {
    return (
      <div className="narrow">
        <h1 className="page-title">Portfolio tracker</h1>
        <p className="lede">
          Add your buys and sells and see what your crypto is worth right now, what you paid on average, and your profit
          or loss, updated live from Coinbase and Kraken.
        </p>
        <p className="row-gap">
          <Link href="/signup?next=/portfolio" className="btn">
            Create a free account
          </Link>
          <Link href="/login?next=/portfolio">or log in</Link>
        </p>
        <p className="muted">
          Just curious? <Link href="/what-if">Try the what-if simulator</Link> without an account.
        </p>
      </div>
    );
  }
  const { add } = await searchParams;
  const txns = await getTxns(session.user.id);
  const ids = [...new Set([...txns.map((t) => t.assetId), ...(add ? [add] : [])])];
  const assets = await getAssetRows(ids);
  const addRow = add ? assets.find((a) => a.id === add) : undefined;
  const addCoin = addRow
    ? { id: addRow.id, symbol: addRow.symbol, name: addRow.name, image: addRow.image, price: addRow.live?.p ?? addRow.refPrice }
    : null;

  return (
    <>
      <h1 className="page-title">Your portfolio</h1>
      <PortfolioView txns={txns} assets={assets} addCoin={addCoin} />
      <p className="muted small disclaimer">
        Profit uses the average cost method: each sale is matched against the average price you paid. This is a tracker,
        not tax advice.
      </p>
    </>
  );
}
