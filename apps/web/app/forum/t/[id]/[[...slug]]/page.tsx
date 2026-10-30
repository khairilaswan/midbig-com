import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { assetPath, FORUM_CATEGORIES, slugify } from "@midbig/shared";
import { PostView, ReplyForm } from "@/components/forum";
import { turnstile } from "@/lib/auth";
import { forumViewer, getPosts, getTopic } from "@/lib/forum";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; slug?: string[] }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await getTopic((await params).id, null);
  if (!topic) return { title: "Topic not found", robots: { index: false } };
  const { first } = await getPosts(topic.id, null);
  return {
    title: topic.title,
    description: first?.body.replace(/\s+/g, " ").slice(0, 155),
    alternates: { canonical: topic.path },
    openGraph: { title: topic.title, type: "article" },
  };
}

export default async function TopicPage({ params, searchParams }: Props) {
  const { id, slug } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { viewer, me } = await forumViewer();
  const topic = await getTopic(id, viewer);
  if (!topic) notFound();
  if (slug?.[0] !== slugify(topic.title)) permanentRedirect(`${topic.path}${page > 1 ? `?page=${page}` : ""}`);
  const { first, replies, pages } = await getPosts(topic.id, viewer, page);
  if (!first) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: topic.title,
    text: first.body.slice(0, 2000),
    url: `${SITE_URL}${topic.path}`,
    datePublished: new Date(topic.createdAt).toISOString(),
    author: { "@type": "Person", name: topic.author.name, url: `${SITE_URL}/u/${encodeURIComponent(topic.author.name)}` },
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: topic.replies },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: topic.helpful },
    ],
  };

  return (
    <div className="forum topic">
      {topic.status === "visible" && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      )}
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/forum">Forum</Link> <span aria-hidden>›</span>{" "}
        <Link href={`/forum/c/${topic.category}`}>{FORUM_CATEGORIES[topic.category]?.name ?? topic.category}</Link>
      </nav>
      <h1 className="page-title">
        {topic.pinned && <span className="badge">Pinned</span>} {topic.locked && <span aria-label="Locked">🔒</span>} {topic.title}
      </h1>
      {topic.assetId && topic.assetSymbol && (
        <p className="muted small">
          About <Link href={assetPath(topic.assetId)}>{topic.assetSymbol}</Link>
        </p>
      )}
      {topic.status !== "visible" && (
        <p className="notice small">
          {topic.status === "held" ? "This topic is waiting for a moderator." : "This topic was removed."} It isn&rsquo;t
          listed or shown to others.
        </p>
      )}

      {page === 1 && <PostView post={first} me={me} title={topic.title} topic={{ id: topic.id, pinned: topic.pinned, locked: topic.locked }} />}
      {page > 1 && (
        <p className="muted small">
          Page {page} of the replies. <Link href={topic.path}>Back to the first post</Link>
        </p>
      )}

      <h2 className="replies-head">
        {topic.replies === 1 ? "1 reply" : `${topic.replies} replies`}
      </h2>
      {replies.map((r) => (
        <PostView key={r.id} post={r} me={me} />
      ))}

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {page > 1 ? <Link href={page === 2 ? topic.path : `${topic.path}?page=${page - 1}`}>← Earlier</Link> : <span />}
          <span className="muted small">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`${topic.path}?page=${page + 1}`}>Later →</Link> : <span />}
        </nav>
      )}

      {topic.status === "visible" && (page === pages || pages === 1) && (
        <ReplyForm topicId={topic.id} me={me} captchaSiteKey={turnstile?.siteKey ?? null} locked={topic.locked} />
      )}
      <p className="muted small">Posts are members&rsquo; opinions, not financial advice.</p>
    </div>
  );
}
