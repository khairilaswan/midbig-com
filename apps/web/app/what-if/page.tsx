import type { Metadata } from "next";
import { computeHoldings } from "@midbig/shared";
import { Simulator } from "@/components/simulator";
import { getSession } from "@/lib/auth";
import { getAssetRows, getTxns } from "@/lib/user-data";

export const metadata: Metadata = {
  title: "Crypto what-if simulator: what if Bitcoin drops or surges?",
  description:
    "See what your crypto would be worth if Bitcoin dropped to $70k or surged to $100k, with other coins moving by how closely they follow Bitcoin. Free, no account needed.",
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
        Pick a scenario and see what your crypto would be worth. Other coins move with Bitcoin by their beta: how much
        each one has moved for every 1% Bitcoin moved over the last 90 days.
      </p>
      <Simulator initial={initial} coins={coins} fromPortfolio={holdings.length > 0} />
    </>
  );
}
