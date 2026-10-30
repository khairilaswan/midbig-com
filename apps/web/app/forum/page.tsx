import type { Metadata } from "next";
import Link from "next/link";
import { FORUM_CATEGORIES, profilePath, repLevel, type ForumCategory } from "@midbig/shared";
import { ago, Pager, TopicList } from "@/components/forum-list";
import { categoryStats, listTopics, topMembers } from "@/lib/forum";

export const metadata: Metadata = {
  title: "Forum: crypto, stock and forex discussions",
  description:
    "Discuss crypto, US stocks and forex with other traders: market news, strategies and risk. Moderated, with a scam filter on every post.",
  alternates: { canonical: "/forum" },
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };

export default async function ForumPage({ searchParams }: Props) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [{ topics, hasMore }, stats, members] = await Promise.all([listTopics({ page }), categoryStats(), topMembers()]);

  return (
    <div className="forum">
      <div className="page-head">
        <h1 className="page-title">Forum</h1>
        <Link href="/forum/new" className="btn">
          Start a topic
        </Link>
      </div>
      <p className="lede">
        Longer conversations than chat: ideas, research and lessons learned. Mark the posts that help you, and the
        people who write them earn reputation.
      </p>

      {page === 1 && (
        <ul className="category-grid">
          {(Object.keys(FORUM_CATEGORIES) as ForumCategory[]).map((c) => (
            <li key={c}>
              <Link href={`/forum/c/${c}`} className="category-card">
                <strong>{FORUM_CATEGORIES[c].name}</strong>
                <span className="muted small">{FORUM_CATEGORIES[c].blurb}</span>
                <span className="muted small">
                  {stats[c]?.topics ?? 0} topics
                  {stats[c]?.lastPostAt ? ` · active ${ago(stats[c]!.lastPostAt!)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="forum-cols">
        <section>
          <h2>Latest</h2>
          <TopicList topics={topics} empty="No topics yet. Start the first one." />
          <Pager base="/forum" page={page} hasMore={hasMore} />
        </section>
        <aside className="panel">
          <h2>Most helpful members</h2>
          {members.length === 0 ? (
            <p className="muted small">Nobody yet. Mark helpful posts with 👍 and their authors show up here.</p>
          ) : (
            <ol className="members">
              {members.map((m) => (
                <li key={m.id}>
                  <Link href={profilePath(m.name)}>{m.name}</Link>{" "}
                  <span className="muted small">
                    {m.reputation} · {repLevel(m.reputation)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="muted small">
            Reputation is the helpful votes a member&rsquo;s posts got from others, minus 10 for each post moderators
            removed. It measures helpfulness, not trading skill. <Link href="/rules#reputation">How it works</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
