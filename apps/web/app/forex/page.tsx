import type { Metadata } from "next";
import { MarketTable } from "@/components/market";
import { getMarketPage } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await getMarketPage(1, "forex");
  return {
    title: "Forex rates today: live currency exchange rates",
    description: "Live exchange rates for the major currency pairs and the US dollar against 20 world currencies, with charts.",
    alternates: { canonical: "/forex" },
    robots: total === 0 ? { index: false } : undefined,
  };
}

export default async function ForexPage() {
  const { rows, total } = await getMarketPage(1, "forex");
  return (
    <>
      <h1 className="page-title">Forex rates</h1>
      {total === 0 ? (
        <p className="empty">Currency exchange rates are coming soon. Crypto prices are live now on the Coins page.</p>
      ) : (
        <>
          <p className="lede">
            Live rates for the major currency pairs, around the clock from Sunday 5 pm to Friday 5 pm New York time. A
            rate is how many units of the second currency one unit of the first buys.
          </p>
          <MarketTable rows={rows} kind="forex" />
        </>
      )}
    </>
  );
}
