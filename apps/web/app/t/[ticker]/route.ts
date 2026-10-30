import { resolveTicker } from "@/lib/communities";

/** Where a $TICKER tag in a post leads: the asset's community, its page, or a community search. */
export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const ticker = decodeURIComponent((await params).ticker);
  const path = /^[A-Za-z][A-Za-z0-9.]{0,9}$/.test(ticker) ? await resolveTicker(ticker) : null;
  // A relative Location works behind any host name (localhost, a tunnel, the real domain).
  return new Response(null, { status: 302, headers: { location: path ?? `/communities?q=${encodeURIComponent(ticker)}` } });
}
