import { NextResponse } from "next/server";
import { getRiskHistory } from "@/lib/user-data";

/** Daily closes for the last year, for the what-if simulator's risk figures. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{1,100}$/.test(s))
    .slice(0, 50);
  if (ids.length === 0) return NextResponse.json({ days: [], closes: {} });
  const history = await getRiskHistory(ids);
  return NextResponse.json(history, { headers: { "cache-control": "public, max-age=3600" } });
}
