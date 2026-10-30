import type { Metadata } from "next";
import { MarketTable } from "@/components/market";
import { notFound } from "next/navigation";
import { getMovers } from "@/lib/server";
import { classEnabled } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top crypto gainers and losers today",
  description: "The cryptocurrencies with the biggest price gains and losses in the last 24 hours, among the top 500 coins.",
  alternates: { canonical: "/gainers-losers" },
};

export default async function GainersLosers() {
  if (!(await classEnabled("crypto"))) notFound();
  const { gainers, losers } = await getMovers(30);
  return (
    <>
      <h1 className="page-title">Top crypto gainers and losers</h1>
      <p className="lede">
        Biggest 24-hour moves among the top 500 coins with at least $50k of daily volume. The ranking refreshes every
        15 minutes; prices update live.
      </p>
      <div className="split">
        <section>
          <h2>Gainers</h2>
          <MarketTable rows={gainers} />
        </section>
        <section>
          <h2>Losers</h2>
          <MarketTable rows={losers} />
        </section>
      </div>
    </>
  );
}
