import Link from "next/link";
import { profilePath } from "@midbig/shared";
import type { Block, BlockTemplate, TemplateLayout } from "@/lib/home-layout";
import type { Community } from "@/lib/communities";
import type { Leader, TrendingTicker } from "@/lib/social";
import type { AssetRow, ForumMe, TopicSummary } from "@/lib/types";
import { Avatar } from "./avatar";
import { ago, FeedCard, TopicList } from "./forum-list";
import { AssetTiles, MiniMarket, TickerTape } from "./home-live";
import { MarketTable, MoverList } from "./market";

export interface HomeData {
  me: ForumMe | null;
  signedIn: boolean;
  /** Top assets of the first category that's on. */
  assets: AssetRow[];
  movers: { gainers: AssetRow[]; losers: AssetRow[] } | null;
  hot: TopicSummary[];
  fresh: TopicSummary[];
  trending: TrendingTicker[];
  leaders: Leader[];
  popular: Community[];
  joined: Community[];
}

function TrendingList({ items }: { items: TrendingTicker[] }) {
  if (items.length === 0) return <p className="muted small">No tickers tagged today yet. Tag one like $BTC in a post.</p>;
  return (
    <ol className="trending">
      {items.map((t) => (
        <li key={t.symbol}>
          <Link href={t.href} className="ticker-tag">
            ${t.symbol}
          </Link>{" "}
          <span className="muted small">
            {t.people} {t.people === 1 ? "member" : "members"} · {t.posts} {t.posts === 1 ? "post" : "posts"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function LeaderList({ items }: { items: Leader[] }) {
  if (items.length === 0) return <p className="muted small">Upvote useful posts and their authors show up here.</p>;
  return (
    <ol className="leaders">
      {items.map((m) => (
        <li key={m.id}>
          <Link href={profilePath(m.name)}>
            <Avatar name={m.name} src={m.avatar} size={22} /> {m.name}
          </Link>{" "}
          <span className="muted small">+{m.points}</span>
        </li>
      ))}
    </ol>
  );
}

function CommunityList({ items }: { items: Community[] }) {
  return (
    <ul className="community-mini">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={c.path}>{c.label}</Link> <span className="muted small">{c.memberCount.toLocaleString("en-US")}</span>
        </li>
      ))}
    </ul>
  );
}

function PostCta({ signedIn }: { signedIn: boolean }) {
  return (
    <Link href={signedIn ? "/forum/new" : "/signup?next=/forum/new"} className="compose-cta">
      <span className="muted">What are you watching today? Share a chart, a call or a question…</span>
      <span className="btn small">Post</span>
    </Link>
  );
}

/** Where a "see all" link in a block's heading goes. */
const MORE: Partial<Record<Block["type"], { href: string; label: string }>> = {
  hotPosts: { href: "/forum", label: "See all" },
  postCards: { href: "/forum", label: "See all" },
  latestPosts: { href: "/forum?sort=new", label: "All" },
  popularCommunities: { href: "/communities", label: "All" },
  miniMarket: { href: "/coins", label: "All prices" },
  marketTable: { href: "/coins", label: "All prices" },
  gainers: { href: "/gainers-losers", label: "See all" },
  losers: { href: "/gainers-losers", label: "See all" },
};

function Heading({ block }: { block: Block }) {
  if (!block.title) return null;
  const more = MORE[block.type];
  return (
    <h2>
      {block.title} {more && <Link href={more.href}>{more.label}</Link>}
    </h2>
  );
}

/** One block's content, or null when it has nothing to show (so its box is left out too). */
function BlockBody({ block, d }: { block: Block; d: HomeData }): React.ReactNode {
  const n = block.limit ?? 10;
  switch (block.type) {
    case "title":
      return <h1 className="page-title">{block.title || "midbig"}</h1>;
    case "text":
      return (
        <div className="home-note">
          <Heading block={block} />
          {block.text && block.text.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
        </div>
      );
    case "compose":
      return <PostCta signedIn={d.signedIn} />;
    case "sortTabs":
      return (
        <nav className="tabs small" aria-label="Sort">
          <Link href="/forum" aria-current="page">
            🔥 Hot
          </Link>
          <Link href="/forum?sort=new">🆕 New</Link>
          <Link href="/forum?sort=top">🏆 Top</Link>
        </nav>
      );
    case "hotPosts":
      return (
        <>
          <Heading block={block} />
          <TopicList topics={d.hot.slice(0, n)} me={d.me} empty="No posts yet. Start the first one." />
          {!block.title && (
            <p>
              <Link href="/forum">More posts →</Link>
            </p>
          )}
        </>
      );
    case "postCards":
      return (
        <>
          <Heading block={block} />
          {d.hot.length === 0 ? (
            <p className="muted">No posts yet. Start the first one.</p>
          ) : (
            <ol className="feed">
              {d.hot.slice(0, n).map((t) => (
                <li key={t.id}>
                  <FeedCard topic={t} me={d.me} />
                </li>
              ))}
            </ol>
          )}
          <p>
            <Link href="/forum">More posts →</Link>
          </p>
        </>
      );
    case "latestPosts":
      return (
        <>
          <Heading block={block} />
          <ol className="term-feed">
            {d.fresh.slice(0, n).map((t) => (
              <li key={t.id}>
                <span className="muted small">{ago(t.createdAt)}</span>{" "}
                <Link href={t.community.path} className="community-tag">
                  {t.community.label}
                </Link>{" "}
                <Link href={t.path}>{t.title}</Link>{" "}
                <span className="muted small">
                  ▲{t.score} · 💬{t.replies}
                </span>
              </li>
            ))}
          </ol>
        </>
      );
    case "yourCommunities":
      if (d.joined.length === 0) return null;
      return (
        <>
          <Heading block={block} />
          <CommunityList items={d.joined.slice(0, n)} />
        </>
      );
    case "popularCommunities":
      return (
        <>
          <Heading block={block} />
          <CommunityList items={d.popular.slice(0, n)} />
        </>
      );
    case "miniMarket":
      if (d.assets.length === 0) return null;
      return (
        <>
          <Heading block={block} />
          <MiniMarket rows={d.assets.slice(0, n)} />
        </>
      );
    case "marketTable":
      return (
        <>
          <Heading block={block} />
          {d.assets.length > 0 ? <MarketTable rows={d.assets.slice(0, n)} /> : <p className="empty">Market data is loading.</p>}
        </>
      );
    case "assetTiles":
      return (
        <>
          <Heading block={block} />
          {d.assets.length > 0 ? <AssetTiles rows={d.assets.slice(0, n)} /> : <p className="empty">Market data is loading. Check back in a minute.</p>}
        </>
      );
    case "tickerTape":
      return d.assets.length > 0 ? <TickerTape rows={d.assets.slice(0, n)} /> : null;
    case "gainers":
    case "losers":
      if (!d.movers) return null;
      return (
        <>
          <Heading block={block} />
          <MoverList rows={d.movers[block.type].slice(0, n)} />
        </>
      );
    case "movers":
      if (!d.movers) return null;
      return (
        <>
          <Heading block={block} />
          <div className="term-movers">
            <div>
              <h2>Gainers</h2>
              <MoverList rows={d.movers.gainers.slice(0, n)} />
            </div>
            <div>
              <h2>Losers</h2>
              <MoverList rows={d.movers.losers.slice(0, n)} />
            </div>
          </div>
        </>
      );
    case "trending":
      return (
        <>
          <Heading block={block} />
          <TrendingList items={d.trending.slice(0, n)} />
        </>
      );
    case "leaders":
      return (
        <>
          <Heading block={block} />
          <LeaderList items={d.leaders.slice(0, n)} />
        </>
      );
  }
}

/** A region's blocks. `box` wraps each block in a panel or card; blocks that fill their own space skip it. */
function Region({ blocks, d, box }: { blocks: Block[] | undefined; d: HomeData; box?: "panel" | "card" }) {
  return (
    <>
      {(blocks ?? []).map((block) => {
        const body = BlockBody({ block, d });
        if (body == null) return null;
        const bare = !box || block.type === "title" || block.type === "tickerTape" || block.type === "compose" || block.type === "sortTabs";
        if (bare) return <div key={block.id} className="home-block">{body}</div>;
        return (
          <section key={block.id} className={`${box}${block.wide ? " span-2" : ""}`}>
            {body}
          </section>
        );
      })}
    </>
  );
}

const hasTitle = (layout: TemplateLayout) => Object.values(layout).some((l) => l.some((b) => b.type === "title"));

/** The home page for a community-first template, built from the admin's blocks. */
export function HomeTemplate({ template, layout, data: d }: { template: BlockTemplate; layout: TemplateLayout; data: HomeData }) {
  const title = hasTitle(layout) ? null : <h1 className="sr-only">midbig</h1>;
  if (template === "hub") {
    return (
      <div className="home-hub">
        {title}
        <aside className="hub-left panel">
          <Region blocks={layout.left} d={d} />
        </aside>
        <section className="hub-main">
          <Region blocks={layout.main} d={d} />
        </section>
        <aside className="hub-right">
          <Region blocks={layout.right} d={d} box="panel" />
        </aside>
      </div>
    );
  }
  if (template === "dashboard") {
    return (
      <div className="home-dash">
        {title}
        <Region blocks={layout.top} d={d} />
        <div className="dash-grid">
          <Region blocks={layout.grid} d={d} box="card" />
        </div>
      </div>
    );
  }
  if (template === "feed") {
    return (
      <div className="home-feed">
        {title}
        <Region blocks={layout.top} d={d} />
        <div className="feed-cols">
          <section className="feed-main">
            <Region blocks={layout.main} d={d} />
          </section>
          <aside className="feed-side">
            <Region blocks={layout.side} d={d} box="panel" />
          </aside>
        </div>
      </div>
    );
  }
  return (
    <div className="home-term">
      {title}
      <Region blocks={layout.top} d={d} />
      <div className="term-panes">
        <section className="term-pane">
          <Region blocks={layout.left} d={d} />
        </section>
        <section className="term-pane">
          <Region blocks={layout.right} d={d} />
        </section>
      </div>
    </div>
  );
}
