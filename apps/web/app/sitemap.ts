import type { MetadataRoute } from "next";
import { FORUM_CATEGORIES } from "@midbig/shared";
import { sitemapTopics } from "@/lib/forum";
import { getAllAssetIds } from "@/lib/server";
import { SITE_URL } from "@/lib/site";
import { assetPath } from "@midbig/shared";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [assets, topics] = await Promise.all([getAllAssetIds(), sitemapTopics()]);
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
    { url: `${SITE_URL}/forum`, changeFrequency: "hourly", priority: 0.7 },
    ...Object.keys(FORUM_CATEGORIES).map((c) => ({ url: `${SITE_URL}/forum/c/${c}`, changeFrequency: "hourly" as const, priority: 0.5 })),
    ...topics.map((t) => ({ url: `${SITE_URL}${t.path}`, lastModified: t.lastPostAt, changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}
