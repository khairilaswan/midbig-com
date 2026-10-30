import type { Metadata } from "next";
import Link from "next/link";
import { MarketTable, type ListKind } from "@/components/market";
import { WatchlistAdd } from "@/components/watchlist-add";
import { getSession } from "@/lib/auth";
import type { AssetRow } from "@/lib/types";
import { getAssetRows, getWatchlistIds } from "@/lib/user-data";

export const metadata: Metadata = { title: "Your watchlist", robots: { index: false } };
export const dynamic = "force-dynamic";

/** One class gets its own column names; a mix gets neutral ones. */
function mixedKind(rows: AssetRow[]): ListKind {
  const classes = new Set(rows.map((r) => r.assetClass));
  return classes.size === 1 ? [...classes][0]! : "mixed";
}

export default async function WatchlistPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="narrow">
        <h1 className="page-title">Watchlist</h1>
        <p className="lede">Keep the coins, stocks and currencies you care about on one page, with live prices.</p>
        <p className="row-gap">
          <Link href="/signup?next=/watchlist" className="btn">
            Create a free account
          </Link>
          <Link href="/login?next=/watchlist">or log in</Link>
        </p>
      </div>
    );
  }
  const rows = await getAssetRows(await getWatchlistIds(session.user.id));
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Your watchlist</h1>
        <WatchlistAdd />
      </div>
      {rows.length === 0 ? (
        <p className="empty">
          Nothing here yet. Search above, or tap ☆ Watch on any coin, stock or forex page.
        </p>
      ) : (
        <MarketTable rows={rows} watch kind={mixedKind(rows)} />
      )}
    </>
  );
}
