import Link from "next/link";
import { assetPath, FLAIRS, profilePath, repLevel, TOP_WINDOWS, type Flair, type TopicSort, type TopWindow } from "@midbig/shared";
import type { ForumAuthor, ForumMe, TopicSummary } from "@/lib/types";
import { Avatar } from "./avatar";
import { SaveButton, ShareButton } from "./social";
import { VoteButtons } from "./votes";

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  if (m < 60 * 24 * 60) return `${Math.round(m / 1440)}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { dateStyle: "medium" });
}

const BADGES = { admin: "Admin", mod: "Mod", bot: "Bot" } as const;

export function AuthorLine({ author, avatar = 20 }: { author: ForumAuthor; avatar?: number | false }) {
  const level = repLevel(author.reputation);
  if (!author.id) return <span className="author muted">{author.name}</span>;
  return (
    <span className="author">
      <Link href={profilePath(author.name)} className="chat-name">
        {avatar !== false && <Avatar name={author.name} src={author.avatar} size={avatar} />}
        {author.name}
      </Link>
      {author.verified && author.badge !== "bot" && (
        <span className="verified" title="Verified member" aria-label="Verified member">
          ✓
        </span>
      )}
      {author.badge && <span className={`badge staff-badge${author.badge === "bot" ? " bot-badge" : ""}`}>{BADGES[author.badge]}</span>}
      {author.badge !== "bot" && level !== "Newcomer" && (
        <span className={`level level-${level.toLowerCase()}`} title={`${author.reputation} reputation`}>
          {level}
        </span>
      )}
    </span>
  );
}

export function StanceTag({ stance }: { stance: "bull" | "bear" | null }) {
  if (!stance) return null;
  return <span className={`stance ${stance}`}>{stance === "bull" ? "▲ Bullish" : "▼ Bearish"}</span>;
}

export function FlairTag({ flair, href }: { flair: Flair | null; href?: string }) {
  if (!flair) return null;
  const f = FLAIRS[flair];
  const inner = (
    <>
      {f.emoji} {f.label}
    </>
  );
  return href ? (
    <Link href={href} className={`flair flair-${flair}`}>
      {inner}
    </Link>
  ) : (
    <span className={`flair flair-${flair}`}>{inner}</span>
  );
}

/** The start of a post as plain text: formatting marks gone, spoilers hidden, cut at a word. */
function plainExcerpt(text: string): string {
  const plain = text
    .replace(/\|\|[^|\n]*\|\|/g, "[spoiler]")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*|~~|`/g, "");
  return text.length >= 320 ? `${plain.replace(/\s+\S*$/, "")}…` : plain;
}

function compact(n: number): string {
  return n < 1000 ? String(n) : n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

/** A post as a card in the social feed: author, title, the start of the text, its first photo and actions. */
export function FeedCard({ topic: t, me }: { topic: TopicSummary; me: ForumMe | null }) {
  return (
    <article className="feed-card">
      <header className="feed-head small">
        <AuthorLine author={t.author} avatar={36} />
        <span className="muted">
          in{" "}
          <Link href={t.community.path} className="community-tag">
            {t.community.label}
          </Link>{" "}
          · {ago(t.createdAt)}
        </span>
      </header>
      <Link href={t.path} className="feed-title">
        {t.title}
      </Link>
      <div className="topic-sub small">
        <FlairTag flair={t.flair} />
        <StanceTag stance={t.stance} />
        {t.hasPoll && <span className="flair">🗳️ Poll</span>}
      </div>
      {t.excerpt && <p className="feed-excerpt">{plainExcerpt(t.excerpt)}</p>}
      {t.cover && (
        <Link href={t.path} className="feed-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.cover} alt="" loading="lazy" decoding="async" />
        </Link>
      )}
      <footer className="post-actions small">
        {t.firstPostId && <VoteButtons postId={t.firstPostId} score={t.score} myVote={t.myVote} me={me} mine={me?.id === t.author.id} compact />}
        <Link href={`${t.path}#comments`} className="btn link small">
          💬 {t.replies}
        </Link>
        <span className="muted" title="Views">
          👁 {compact(t.views)}
        </span>
        <SaveButton topicId={t.id} saved={t.saved} signedIn={me != null} />
        <ShareButton path={t.path} title={t.title} />
      </footer>
    </article>
  );
}

export function TopicList({
  topics,
  me,
  showCommunity = true,
  empty = "No topics yet.",
}: {
  topics: TopicSummary[];
  me: ForumMe | null;
  showCommunity?: boolean;
  empty?: string;
}) {
  if (topics.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ol className="topic-list">
      {topics.map((t) => (
        <li key={t.id} className="topic-row voted">
          {t.firstPostId && (
            <VoteButtons postId={t.firstPostId} score={t.score} myVote={t.myVote} me={me} mine={me?.id === t.author.id} compact />
          )}
          <div className="topic-main">
            <Link href={t.path} className="topic-title">
              {t.pinned && <span className="badge">Pinned</span>} {t.locked && <span aria-label="Locked">🔒</span>} {t.title}
              {t.hasPoll && <span title="Has a poll"> 🗳️</span>}
            </Link>
            <div className="muted small topic-sub">
              <FlairTag flair={t.flair} />
              {showCommunity && (
                <Link href={t.community.path} className="community-tag">
                  {t.community.label}
                </Link>
              )}
              <StanceTag stance={t.stance} />
              <AuthorLine author={t.author} />
              {!showCommunity && t.assetId && t.assetSymbol && t.community.label.toUpperCase() !== `B/${t.assetSymbol}` && (
                <Link href={assetPath(t.assetId)}>{t.assetSymbol}</Link>
              )}
              <span>{ago(t.createdAt)}</span>
            </div>
          </div>
          {t.cover && (
            <Link href={t.path} className="topic-thumb" tabIndex={-1} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.cover} alt="" loading="lazy" decoding="async" />
            </Link>
          )}
          <div className="topic-stats small muted">
            <Link href={`${t.path}#comments`} title="Comments">
              💬 {t.replies}
            </Link>
            <span title="Views">👁 {compact(t.views)}</span>
            <span title="Latest activity">{ago(t.lastPostAt)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Hot, New and Top tabs, with Top's time window. `extra` keeps the page's other query values. */
export function SortTabs({
  path,
  sort,
  window,
  extra = {},
}: {
  path: string;
  sort: TopicSort;
  window: TopWindow;
  extra?: Record<string, string>;
}) {
  const href = (params: Record<string, string>) => {
    const q = new URLSearchParams({ ...extra, ...params }).toString();
    return q ? `${path}?${q}` : path;
  };
  return (
    <div className="sort-bar">
      <nav className="tabs small" aria-label="Sort">
        <Link href={href({})} aria-current={sort === "hot" ? "page" : undefined}>
          🔥 Hot
        </Link>
        <Link href={href({ sort: "new" })} aria-current={sort === "new" ? "page" : undefined}>
          🆕 New
        </Link>
        <Link href={href({ sort: "top", t: window })} aria-current={sort === "top" ? "page" : undefined}>
          🏆 Top
        </Link>
      </nav>
      {sort === "top" && (
        <nav className="tabs small windows" aria-label="Time window">
          {(Object.keys(TOP_WINDOWS) as TopWindow[]).map((w) => (
            <Link key={w} href={href({ sort: "top", t: w })} aria-current={window === w ? "page" : undefined}>
              {TOP_WINDOWS[w].label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

/** The query string for a sort, for building pager links. */
export function sortQuery(sort: TopicSort, window: TopWindow, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...extra, ...(sort === "hot" ? {} : sort === "new" ? { sort } : { sort, t: window }) }).toString();
  return q ? `?${q}` : "";
}

export function Pager({ base, page, hasMore }: { base: string; page: number; hasMore: boolean }) {
  if (page <= 1 && !hasMore) return null;
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  return (
    <nav className="pager" aria-label="Pages">
      {page > 1 ? <Link href={page === 2 ? base : href(page - 1)}>← Back</Link> : <span />}
      <span className="muted small">Page {page}</span>
      {hasMore ? <Link href={href(page + 1)}>More →</Link> : <span />}
    </nav>
  );
}

/** The asset's community on its price page: the top topics and a way in. */
export function AssetDiscussions({
  topics,
  me,
  community,
  asset,
}: {
  topics: TopicSummary[];
  me: ForumMe | null;
  community: { id: string; label: string; path: string; memberCount: number } | null;
  asset: { name: string };
}) {
  return (
    <section className="panel discussions">
      <div className="panel-head">
        <h2>{community ? <Link href={community.path}>{community.label}</Link> : `${asset.name} discussions`}</h2>
        {community && (
          <span className="row-gap">
            <span className="muted small">{community.memberCount.toLocaleString("en-US")} members</span>
            <Link href={`/forum/new?community=${community.id}`} className="btn secondary small">
              Post
            </Link>
            <Link href={community.path} className="btn small">
              Open community
            </Link>
          </span>
        )}
      </div>
      {community ? (
        <TopicList topics={topics} me={me} showCommunity={false} empty={`Nothing in ${community.label} yet. Start the first topic.`} />
      ) : (
        <p className="muted small">{asset.name} doesn&rsquo;t have a community yet.</p>
      )}
    </section>
  );
}

export { ago };
