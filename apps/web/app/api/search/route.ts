import { NextResponse } from "next/server";
import { searchAssets } from "@/lib/server";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchAssets(q);
  return NextResponse.json(results, { headers: { "cache-control": "public, max-age=60" } });
}
