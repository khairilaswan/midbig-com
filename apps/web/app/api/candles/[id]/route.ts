import { NextResponse } from "next/server";
import { getChart, type ChartRange } from "@/lib/server";

const RANGES = new Set<ChartRange>(["1d", "7d", "30d", "1y"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const range = (new URL(req.url).searchParams.get("range") ?? "1d") as ChartRange;
  if (!RANGES.has(range)) return NextResponse.json({ error: "bad range" }, { status: 400 });
  const points = await getChart(id, range);
  return NextResponse.json(points, {
    headers: { "cache-control": `public, max-age=${range === "1d" ? 30 : 300}` },
  });
}
