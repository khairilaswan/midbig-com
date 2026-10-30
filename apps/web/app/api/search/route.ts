import { NextResponse } from "next/server";
import type { AssetClass } from "@midbig/shared";
import { searchAssets } from "@/lib/server";

const CLASSES = new Set<AssetClass>(["crypto", "stock", "forex"]);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q") ?? "";
  const only = (params.get("classes") ?? "").split(",").filter((c): c is AssetClass => CLASSES.has(c as AssetClass));
  const results = await searchAssets(q, only.length > 0 ? only : undefined);
  return NextResponse.json(results, { headers: { "cache-control": "public, max-age=60" } });
}
