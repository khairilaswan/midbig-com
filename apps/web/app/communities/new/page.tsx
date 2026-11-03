import type { Metadata } from "next";
import Link from "next/link";
import { COMMUNITY_LIMITS } from "@midbig/shared";
import { CreateCommunityForm } from "@/components/community";
import { requireSession } from "@/lib/auth";
import { getViewer } from "@/lib/chat";
import { pool } from "@/lib/server";

export const metadata: Metadata = { title: "Create a community", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewCommunityPage() {
  const session = await requireSession("/communities/new");
  const viewer = await getViewer(session.user.id);
  const admin = viewer?.role === "admin";
  if (!viewer || !(viewer.verified || admin)) {
    return (
      <div className="narrow">
        <h1 className="page-title">Create a community</h1>
        <p className="notice">
          Only verified members can create m/ communities for smaller coins. Verification is handled by midbig staff
          for now. Meanwhile you can post in any existing <Link href="/communities">community</Link>.
        </p>
      </div>
    );
  }
  // Listed assets without a community, biggest first.
  const listed = await pool().query<{ id: string; name: string; symbol: string; asset_class: string }>(
    `SELECT a.id, a.name, a.symbol, a.asset_class FROM assets a
     WHERE NOT EXISTS (SELECT 1 FROM communities c WHERE c.asset_id = a.id)
       AND (a.asset_class <> 'stock' OR a.ref_price IS NOT NULL) ${admin ? "" : "AND a.asset_class = 'crypto'"}
     ORDER BY a.asset_class, a.market_cap_rank NULLS LAST, a.market_cap DESC NULLS LAST LIMIT 1500`,
  );

  return (
    <div className="narrow">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/communities">Communities</Link> <span aria-hidden>›</span> <span>New</span>
      </nav>
      <h1 className="page-title">Create a community</h1>
      {!admin && (
        <p className="lede small">
          m/ communities are for coins midbig doesn&rsquo;t list, or listed coins that don&rsquo;t have a b/ community
          yet. You can create up to {COMMUNITY_LIMITS.perMember}.
        </p>
      )}
      <CreateCommunityForm
        isAdmin={admin}
        listed={listed.rows.map((a) => ({
          id: a.id,
          cls: a.asset_class,
          label: `${a.asset_class === "forex" ? a.id.slice(3).replace("-", "/").toUpperCase() : a.symbol.toUpperCase()} · ${a.name} (${a.asset_class})`,
        }))}
      />
    </div>
  );
}
