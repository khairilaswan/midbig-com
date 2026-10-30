import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { assetPath, parseCommentSort, slugify, type CommentSort } from "@midbig/shared";
import { CommentForm, CommentTree, PostView } from "@/components/forum";
import { StanceTag } from "@/components/forum-list";
import { turnstile } from "@/lib/auth";
import { canModerateCommunity, getCommunityById } from "@/lib/communities";
import { forumViewer, getPosts, getTopic } from "@/lib/forum";
import { classEnabled } from "@/lib/settings";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; slug?: string[] }>; searchParams: Promise<{ sort?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await getTopic((await params).id, null);
  if (!topic) return { title: "Topic not found", robots: { index: false } };
  const { first } = await getPosts(topic.id, null, false);
  return {
    title: `${topic.title} : ${topic.community.label}`,
    description: first?.body.replace(/\s+/g, " ").slice(0, 155),
    alternates: { canonical: topic.path },
    openGraph: { title: topic.title, type: "article" },
    // Heavily downvoted topics aren't worth a search result.
    robots: topic.score <= -4 ? { index: false } : undefined,
  };
}

const SORTS: Record<CommentSort, string> = { best: "Best", new: "Newest", old: "Oldest" };

export default async function TopicPage({ params, searchParams }: Props) {
  const { id, slug } = await params;
  const sort = parseCommentSort((await searchParams).sort);
  const { viewer, me: base } = await forumViewer();
  const topic = await getTopic(id, viewer);
  if (!topic) notFound();
  // Community moderators get their tools here too.
  const me = base && { ...base, canModerate: await canModerateCommunity(viewer, topic.community.id) };
  if (slug?.[0] !== slugify(topic.title)) permanentRedirect(topic.path);
  const community = await getCommunityById(topic.community.id);
  if (!community || (community.status !== "active" && !me?.isSiteMod) || !(await classEnabled(community.assetClass))) notFound();
  const { first, comments } = await getPosts(topic.id, viewer, me?.canModerate ?? false);
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
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: Math.max(0, topic.score) },
    ],
  };
  const captchaSiteKey = turnstile?.siteKey ?? null;

  return (
    <div className="forum topic">
      {topic.status === "visible" && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      )}
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/forum">Communities</Link> <span aria-hidden>›</span> <Link href={topic.community.path}>{topic.community.label}</Link>
      </nav>
      <h1 className="page-title">
        {topic.pinned && <span className="badge">Pinned</span>} {topic.locked && <span aria-label="Locked">🔒</span>} {topic.title}
      </h1>
      <p className="muted small topic-sub">
        <StanceTag stance={topic.stance} />
        {topic.assetId && topic.assetSymbol && (
          <Link href={assetPath(topic.assetId)}>
            {topic.assetSymbol} price and chart
          </Link>
        )}
      </p>
      {topic.status !== "visible" && (
        <p className="notice small">
          {topic.status === "held" ? "This topic is waiting for a moderator." : "This topic was removed."} It isn&rsquo;t
          listed or shown to others.
        </p>
      )}

      <PostView
        post={first}
        me={me}
        title={topic.title}
        topic={{ id: topic.id, pinned: topic.pinned, locked: topic.locked, communityPath: topic.community.path }}
      />

      <div className="comments-head" id="comments">
        <h2 className="replies-head">{topic.replies === 1 ? "1 comment" : `${topic.replies} comments`}</h2>
        <nav className="tabs small" aria-label="Sort comments">
          {(Object.keys(SORTS) as CommentSort[]).map((s) => (
            <Link key={s} href={`${topic.path}${s === "best" ? "" : `?sort=${s}`}#comments`} aria-current={sort === s ? "page" : undefined}>
              {SORTS[s]}
            </Link>
          ))}
        </nav>
      </div>
      {topic.status === "visible" && (
        <CommentForm topicId={topic.id} me={me} captchaSiteKey={captchaSiteKey} locked={topic.locked} />
      )}
      <CommentTree comments={comments} me={me} topicId={topic.id} locked={topic.locked && !me?.canModerate} captchaSiteKey={captchaSiteKey} sort={sort} />
      <p className="muted small">Posts are members&rsquo; opinions and bots&rsquo; automated replies, not financial advice.</p>
    </div>
  );
}
