import Link from "next/link";
import { assetPath, FORUM_CATEGORIES, profilePath, repLevel } from "@midbig/shared";
import type { ForumAuthor, TopicSummary } from "@/lib/types";

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  if (m < 60 * 24 * 60) return `${Math.round(m / 1440)}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { dateStyle: "medium" });
}

export function AuthorLine({ author }: { author: ForumAuthor }) {
  const level = repLevel(author.reputation);
  return (
    <span className="author">
      <Link href={profilePath(author.name)} className="chat-name">
        {author.name}
      </Link>
      {author.badge && <span className="badge staff-badge">{author.badge === "admin" ? "Admin" : "Mod"}</span>}
      {level !== "Newcomer" && (
        <span className={`level level-${level.toLowerCase()}`} title={`${author.reputation} reputation`}>
          {level}
        </span>
      )}
    </span>
  );
}

export function TopicList({
  topics,
  showCategory = true,
  empty = "No topics yet.",
}: {
  topics: TopicSummary[];
  showCategory?: boolean;
  empty?: string;
}) {
  if (topics.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ol className="topic-list">
      {topics.map((t) => (
        <li key={t.id} className="topic-row">
          <div className="topic-main">
            <Link href={t.path} className="topic-title">
              {t.pinned && <span className="badge">Pinned</span>} {t.locked && <span aria-label="Locked">🔒</span>} {t.title}
            </Link>
            <div className="muted small">
              <AuthorLine author={t.author} />
              {showCategory && (
                <>
                  {" · "}
                  <Link href={`/forum/c/${t.category}`}>{FORUM_CATEGORIES[t.category]?.name ?? t.category}</Link>
                </>
              )}
              {t.assetId && t.assetSymbol && (
                <>
                  {" · "}
                  <Link href={assetPath(t.assetId)}>{t.assetSymbol}</Link>
                </>
              )}
            </div>
          </div>
          <div className="topic-stats small muted">
            <span title="Replies">💬 {t.replies}</span>
            <span title="Helpful votes">👍 {t.helpful}</span>
            <span>{ago(t.lastPostAt)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Pager({ base, page, hasMore }: { base: string; page: number; hasMore: boolean }) {
  if (page <= 1 && !hasMore) return null;
  const href = (p: number) => `${base}${base.includes("?") ? "&" : "?"}page=${p}`;
  return (
    <nav className="pager" aria-label="Pages">
      {page > 1 ? <Link href={page === 2 ? base : href(page - 1)}>← Newer</Link> : <span />}
      <span className="muted small">Page {page}</span>
      {hasMore ? <Link href={href(page + 1)}>Older →</Link> : <span />}
    </nav>
  );
}

/** Up to five topics about one asset, for its page. */
export function AssetDiscussions({
  topics,
  asset,
}: {
  topics: TopicSummary[];
  asset: { id: string; name: string; symbol: string };
}) {
  return (
    <section className="panel discussions">
      <div className="panel-head">
        <h2>{asset.symbol} discussions</h2>
        <Link href={`/forum/new?asset=${encodeURIComponent(asset.id)}`} className="btn secondary small">
          Start a topic
        </Link>
      </div>
      <TopicList topics={topics} showCategory={false} empty={`No topics about ${asset.name} yet. Start the first one.`} />
    </section>
  );
}

export { ago };
