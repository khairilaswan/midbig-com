import type { Metadata } from "next";
import { computeHoldings } from "@midbig/shared";
import { Simulator } from "@/components/simulator";
import { getSession } from "@/lib/auth";
import { getAssetRows, getTxns } from "@/lib/user-data";

export const metadata: Metadata = {
  title: "What-if simulator: what if Bitcoin or the stock market drops?",
  description:
    "See what your crypto and stocks would be worth if Bitcoin dropped to $70k or the S&P 500 fell 20%, with each holding moving by its beta. Free, no account needed.",
  alternates: { canonical: "/what-if" },
};
export const dynamic = "force-dynamic";

const ALWAYS = ["bitcoin", "ethereum", "solana"];

export default async function WhatIfPage() {
  const session = await getSession();
  const holdings = session ? computeHoldings(await getTxns(session.user.id)).filter((h) => h.quantity > 0) : [];
  const initial = holdings.map((h) => ({ assetId: h.assetId, quantity: h.quantity }));
  const coins = await getAssetRows([...new Set([...ALWAYS, ...initial.map((p) => p.assetId)])]);

  return (
    <>
      <h1 className="page-title">What if…?</h1>
      <p className="lede">
        Pick a scenario and see what your crypto and stocks would be worth. Coins move with Bitcoin by their beta: how
        much each one has moved for every 1% Bitcoin moved over the last 90 days. Stocks move with the S&amp;P 500 by
        their published beta.
      </p>
      <Simulator initial={initial} coins={coins} fromPortfolio={holdings.length > 0} />
    </>
  );
}
