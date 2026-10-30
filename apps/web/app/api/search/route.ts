import { NextResponse } from "next/server";
import type { AssetClass } from "@midbig/shared";
import { searchAssets } from "@/lib/server";
import { enabledClasses } from "@/lib/settings";

const CLASSES = new Set<AssetClass>(["crypto", "stock", "forex"]);

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q") ?? "";
  const only = (params.get("classes") ?? "").split(",").filter((c): c is AssetClass => CLASSES.has(c as AssetClass));
  const on = await enabledClasses();
  const classes = (only.length > 0 ? only : on).filter((c) => on.includes(c));
  const results = classes.length ? await searchAssets(q, classes) : [];
  return NextResponse.json(results, { headers: { "cache-control": "public, max-age=10" } });
}
