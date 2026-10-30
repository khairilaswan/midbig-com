import type { MetadataRoute } from "next";
import { getAllAssetIds } from "@/lib/server";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const assets = await getAllAssetIds();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/gainers-losers`, changeFrequency: "hourly", priority: 0.8 },
    ...assets.map((a) => ({
      url: `${SITE_URL}/coins/${a.id}`,
      lastModified: a.updatedAt ?? undefined,
      changeFrequency: "always" as const,
      priority: 0.7,
    })),
  ];
}
