import type { Metadata } from "next";
import Link from "next/link";
import { parseSort, parseWindow, profilePath, repLevel } from "@midbig/shared";
import { Pager, SortTabs, sortQuery, TopicList } from "@/components/forum-list";
import { joinedCommunities, listCommunities } from "@/lib/communities";
import { forumViewer, listTopics, topMembers } from "@/lib/forum";
import { followingIds, trendingTickers, weeklyLeaders } from "@/lib/social";

export const metadata: Metadata = {
  title: "Communities: crypto, stock and forex discussions",
  description:
    "Trading communities for every coin, stock and forex pair: b/bitcoin, b/AAPL, b/eurusd and more. Up and down votes, live chat and charts, with a scam filter on every post.",
  alternates: { canonical: "/forum" },
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string; sort?: string; t?: string; feed?: string }> };

type Feed = "mine" | "all" | "following" | "saved";

/**
 * The home feed: topics from the communities you joined, from members you
 * follow, the ones you saved, or from every community ("all", and for visitors).
 */
export default async function ForumPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = parseSort(sp.sort);
  const window = parseWindow(sp.t);
  const { viewer, me } = await forumViewer();
  const [joined, follows] = viewer ? await Promise.all([joinedCommunities(viewer.id), followingIds(viewer.id)]) : [[], []];
  const feed: Feed =
    viewer && (sp.feed === "following" || sp.feed === "saved") ? sp.feed : joined.length > 0 && sp.feed !== "all" ? "mine" : "all";
  const mine = feed === "mine";
  const [{ topics, hasMore }, popular, members, trending, leaders] = await Promise.all([
    listTopics({
      communityIds: mine ? joined.map((c) => c.id) : undefined,
      authorIds: feed === "following" ? follows : undefined,
      savedBy: feed === "saved" ? viewer?.id : undefined,
      sort: feed === "saved" ? "new" : sort,
      window,
      page,
      viewerId: viewer?.id,
    }),
    listCommunities({ sort: "members", limit: 12 }),
    topMembers(),
    trendingTickers(8),
    weeklyLeaders(5),
  ]);
  const extra: Record<string, string> = feed === "mine" || (feed === "all" && !joined.length) ? {} : { feed };
  const empty = {
    mine: "Nothing new in your communities. Try Everything.",
    all: "No topics yet. Start the first one.",
    following: follows.length ? "The members you follow haven't posted lately." : "Follow members from their profiles to see their posts here.",
    saved: "Nothing saved yet. Tap 🔖 Save on a post to keep it here.",
  }[feed];

  return (
    <div className="forum">
      <div className="page-head">
        <h1 className="page-title">Communities</h1>
        <span className="row-gap">
          <Link href="/communities" className="btn secondary">
            Browse communities
          </Link>
          <Link href="/forum/new" className="btn">
            + Post
          </Link>
        </span>
      </div>
      <p className="lede">
        A community for every coin, stock and forex pair: <strong>b/</strong> for the big ones, <strong>m/</strong> for
        smaller coins. Vote posts up or down, tag assets like <code>$BTC</code>, and ask the bots.
      </p>

      <div className="forum-cols">
        <section>
          {viewer && (
            <nav className="tabs" aria-label="Feed">
              {joined.length > 0 && (
                <Link href="/forum" aria-current={mine ? "page" : undefined}>
                  Your communities
                </Link>
              )}
              <Link href="/forum?feed=all" aria-current={feed === "all" ? "page" : undefined}>
                Everything
              </Link>
              <Link href="/forum?feed=following" aria-current={feed === "following" ? "page" : undefined}>
                Following
              </Link>
              <Link href="/forum?feed=saved" aria-current={feed === "saved" ? "page" : undefined}>
                🔖 Saved
              </Link>
            </nav>
          )}
          {feed !== "saved" && <SortTabs path="/forum" sort={sort} window={window} extra={extra} />}
          <TopicList topics={topics} me={me} empty={empty} />
          <Pager base={`/forum${sortQuery(sort, window, extra)}`} page={page} hasMore={hasMore} />
        </section>
        <aside className="panel">
          {joined.length > 0 && (
            <>
              <h2>Your communities</h2>
              <ul className="community-mini">
                {joined.slice(0, 15).map((c) => (
                  <li key={c.id}>
                    <Link href={c.path}>{c.label}</Link> <span className="muted small">{c.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2>Popular</h2>
          <ul className="community-mini">
            {popular.map((c) => (
              <li key={c.id}>
                <Link href={c.path}>{c.label}</Link>{" "}
                <span className="muted small">
                  {c.memberCount.toLocaleString("en-US")} {c.memberCount === 1 ? "member" : "members"}
                </span>
              </li>
            ))}
          </ul>
          <p className="small">
            <Link href="/communities">All communities →</Link>
          </p>
          <h2>Trending tickers</h2>
          {trending.length === 0 ? (
            <p className="muted small">Nothing tagged today yet.</p>
          ) : (
            <ol className="trending">
              {trending.map((t) => (
                <li key={t.symbol}>
                  <Link href={t.href} className="ticker-tag">
                    ${t.symbol}
                  </Link>{" "}
                  <span className="muted small">{t.people} {t.people === 1 ? "member" : "members"}</span>
                </li>
              ))}
            </ol>
          )}
          {leaders.length > 0 && (
            <>
              <h2>Top this week</h2>
              <ol className="members">
                {leaders.map((m) => (
                  <li key={m.id}>
                    <Link href={profilePath(m.name)}>{m.name}</Link> <span className="muted small">+{m.points}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          <h2>Top members</h2>
          {members.length === 0 ? (
            <p className="muted small">Nobody yet. Upvote useful posts and their authors show up here.</p>
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
            Reputation is the up and down votes a member&rsquo;s posts got from others, minus 10 for each post
            moderators removed. It measures usefulness, not trading skill. <Link href="/rules#reputation">How it works</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
