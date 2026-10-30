import type { Metadata } from "next";
import Link from "next/link";
import { isForumCategory } from "@midbig/shared";
import { TopicForm } from "@/components/forum";
import { turnstile } from "@/lib/auth";
import { forumViewer } from "@/lib/forum";
import { getAsset } from "@/lib/server";

export const metadata: Metadata = { title: "Start a topic", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ category?: string; asset?: string }> };

export default async function NewTopicPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [{ me }, asset] = await Promise.all([forumViewer(), sp.asset ? getAsset(sp.asset) : null]);
  const category = sp.category && isForumCategory(sp.category) ? sp.category : null;

  return (
    <div className="narrow">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/forum">Forum</Link> <span aria-hidden>›</span> <span>New topic</span>
      </nav>
      <h1 className="page-title">Start a topic</h1>
      <TopicForm
        me={me}
        captchaSiteKey={turnstile?.siteKey ?? null}
        category={category}
        asset={asset ? { id: asset.id, name: asset.name, symbol: asset.symbol } : null}
      />
    </div>
  );
}
