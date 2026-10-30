import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FORUM_CATEGORIES, isForumCategory } from "@midbig/shared";
import { Pager, TopicList } from "@/components/forum-list";
import { listTopics } from "@/lib/forum";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ category: string }>; searchParams: Promise<{ page?: string; sort?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  if (!isForumCategory(category)) return { title: "Forum" };
  const c = FORUM_CATEGORIES[category];
  return { title: `${c.name} forum`, description: c.blurb, alternates: { canonical: `/forum/c/${category}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  if (!isForumCategory(category)) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = sp.sort === "top" ? "top" : "latest";
  const { topics, hasMore } = await listTopics({ category, sort, page });
  const c = FORUM_CATEGORIES[category];
  const base = `/forum/c/${category}${sort === "top" ? "?sort=top" : ""}`;

  return (
    <div className="forum">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/forum">Forum</Link> <span aria-hidden>›</span> <span>{c.name}</span>
      </nav>
      <div className="page-head">
        <h1 className="page-title">{c.name}</h1>
        <Link href={`/forum/new?category=${category}`} className="btn">
          Start a topic
        </Link>
      </div>
      <p className="lede">{c.blurb}</p>
      <p className="tabs small">
        <Link href={`/forum/c/${category}`} aria-current={sort === "latest" ? "page" : undefined}>
          Latest
        </Link>
        <Link href={`/forum/c/${category}?sort=top`} aria-current={sort === "top" ? "page" : undefined}>
          Most helpful this month
        </Link>
      </p>
      <TopicList topics={topics} showCategory={false} empty="No topics here yet. Start the first one." />
      <Pager base={base} page={page} hasMore={hasMore} />
    </div>
  );
}
