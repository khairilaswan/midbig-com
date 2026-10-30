import type { MetadataRoute } from "next";
import { listCommunities } from "@/lib/communities";
import { sitemapTopics } from "@/lib/forum";
import { enabledClasses } from "@/lib/settings";
import { getAllAssetIds } from "@/lib/server";
import { SITE_URL } from "@/lib/site";
import { assetClassOf, assetPath } from "@midbig/shared";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [all, topics, communities, on] = await Promise.all([
    getAllAssetIds(),
    sitemapTopics(),
    listCommunities({ sort: "active", limit: 5000 }),
    enabledClasses(),
  ]);
  const assets = all.filter((a) => on.includes(assetClassOf(a.id)));
  return [
    { url: `${SITE_URL}/`, changeFrequency: "always", priority: 1 },
    ...(on.includes("crypto") ? [{ url: `${SITE_URL}/gainers-losers`, changeFrequency: "hourly" as const, priority: 0.8 }] : []),
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
    { url: `${SITE_URL}/communities`, changeFrequency: "daily", priority: 0.6 },
    ...communities
      .filter((c) => c.ns === "b" || c.topicCount >= 5)
      .map((c) => ({ url: `${SITE_URL}${c.path}`, changeFrequency: "hourly" as const, priority: 0.6 })),
    ...topics.map((t) => ({ url: `${SITE_URL}${t.path}`, lastModified: t.lastPostAt, changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}
