import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoinMarket, parsePage } from "@/components/coin-market";
import { siteLook } from "@/lib/look";
import { categories } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

/** The full coin list. While the site's home page is the Markets template, the same list lives at "/" too, so that's canonical. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePage((await searchParams).page);
  const base = (await siteLook()).template === "markets" ? "/" : "/coins";
  return {
    title: page > 1 ? `Cryptocurrency prices by market cap, page ${page}` : "Cryptocurrency prices by market cap",
    alternates: { canonical: page > 1 ? `${base}?page=${page}` : base },
  };
}

export default async function CoinsPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  if (Number.isNaN(page) || !(await categories()).crypto) notFound();
  return <CoinMarket page={page} base="/coins" />;
}
