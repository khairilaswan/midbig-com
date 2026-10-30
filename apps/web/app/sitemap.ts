import type { MetadataRoute } from "next";
import { getAllAssetIds } from "@/lib/server";
import { SITE_URL } from "@/lib/site";
import { assetPath } from "@midbig/shared";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const assets = await getAllAssetIds();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${SITE_URL}/gainers-losers`, changeFrequency: "hourly", priority: 0.8 },
    ...(assets.some((a) => a.id.startsWith("stock-"))
      ? [{ url: `${SITE_URL}/stocks`, changeFrequency: "always" as const, priority: 0.9 }]
      : []),
    ...(assets.some((a) => a.id.startsWith("fx-"))
      ? [{ url: `${SITE_URL}/forex`, changeFrequency: "always" as const, priority: 0.9 }]
      : []),
    ...assets.map((a) => ({
      url: `${SITE_URL}${assetPath(a.id)}`,
      lastModified: a.updatedAt ?? undefined,
      changeFrequency: "always" as const,
      priority: 0.7,
    })),
  ];
}
