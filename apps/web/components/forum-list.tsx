import Link from "next/link";
import { assetPath, profilePath, repLevel, TOP_WINDOWS, type TopicSort, type TopWindow } from "@midbig/shared";
import type { ForumAuthor, ForumMe, TopicSummary } from "@/lib/types";
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

export function AuthorLine({ author }: { author: ForumAuthor }) {
  const level = repLevel(author.reputation);
  if (!author.id) return <span className="author muted">{author.name}</span>;
  return (
    <span className="author">
      <Link href={profilePath(author.name)} className="chat-name">
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
            </Link>
            <div className="muted small topic-sub">
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
          <div className="topic-stats small muted">
            <Link href={`${t.path}#comments`} title="Comments">
              💬 {t.replies}
            </Link>
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
