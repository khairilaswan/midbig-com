import { NextResponse } from "next/server";
import { communityCard, userCard } from "@/lib/cards";

/** The small hover popup for a member (?u=name) or a community (?c=b/bitcoin). */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const u = params.get("u");
  const c = params.get("c");
  try {
    const card = u && u.length <= 40 ? await userCard(u) : c && c.length <= 64 ? await communityCard(c) : null;
    if (!card) return NextResponse.json(null, { status: 404, headers: { "cache-control": "public, max-age=30" } });
    return NextResponse.json(card, { headers: { "cache-control": "public, max-age=30" } });
  } catch (err) {
    console.error("hover card failed", err);
    return NextResponse.json(null, { status: 500 });
  }
}
