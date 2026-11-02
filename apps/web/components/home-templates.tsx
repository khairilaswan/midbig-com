import Link from "next/link";
import { profilePath, type TemplateId } from "@midbig/shared";
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

/** Community hub: communities on the left, hot posts in the middle, markets on the right. */
function Hub({ d }: { d: HomeData }) {
  return (
    <div className="home-hub">
      <aside className="hub-left panel">
        {d.joined.length > 0 && (
          <>
            <h2>Your communities</h2>
            <CommunityList items={d.joined.slice(0, 12)} />
          </>
        )}
        <h2>Popular</h2>
        <CommunityList items={d.popular} />
        <p className="small">
          <Link href="/communities">All communities →</Link>
        </p>
      </aside>
      <section className="hub-main">
        <h1 className="page-title">Today on midbig</h1>
        <PostCta signedIn={d.signedIn} />
        <nav className="tabs small" aria-label="Sort">
          <Link href="/forum" aria-current="page">
            🔥 Hot
          </Link>
          <Link href="/forum?sort=new">🆕 New</Link>
          <Link href="/forum?sort=top">🏆 Top</Link>
        </nav>
        <TopicList topics={d.hot} me={d.me} empty="No posts yet. Start the first one." />
        <p>
          <Link href="/forum">More posts →</Link>
        </p>
      </section>
      <aside className="hub-right">
        {d.assets.length > 0 && (
          <section className="panel">
            <h2>Markets</h2>
            <MiniMarket rows={d.assets.slice(0, 10)} />
            <p className="small">
              <Link href="/coins">All prices →</Link>
            </p>
          </section>
        )}
        <section className="panel">
          <h2>Trending tickers</h2>
          <TrendingList items={d.trending} />
        </section>
        <section className="panel">
          <h2>Top this week</h2>
          <LeaderList items={d.leaders} />
        </section>
      </aside>
    </div>
  );
}

/** Dashboard: price tiles, movers, trending, hot posts and leaders as cards. */
function Dashboard({ d }: { d: HomeData }) {
  return (
    <div className="home-dash">
      <h1 className="page-title">Market dashboard</h1>
      {d.assets.length > 0 ? <AssetTiles rows={d.assets.slice(0, 8)} /> : <p className="empty">Market data is loading. Check back in a minute.</p>}
      <div className="dash-grid">
        {d.movers && (
          <>
            <section className="card">
              <h2>
                Top gainers <Link href="/gainers-losers">See all</Link>
              </h2>
              <MoverList rows={d.movers.gainers} />
            </section>
            <section className="card">
              <h2>
                Top losers <Link href="/gainers-losers">See all</Link>
              </h2>
              <MoverList rows={d.movers.losers} />
            </section>
          </>
        )}
        <section className="card">
          <h2>Trending tickers</h2>
          <TrendingList items={d.trending.slice(0, 8)} />
        </section>
        <section className="card span-2">
          <h2>
            Hot posts <Link href="/forum">See all</Link>
          </h2>
          <TopicList topics={d.hot.slice(0, 6)} me={d.me} empty="No posts yet." />
        </section>
        <section className="card">
          <h2>Top members this week</h2>
          <LeaderList items={d.leaders.slice(0, 8)} />
        </section>
      </div>
    </div>
  );
}

/** Social feed: a live tape, then one column of post cards with photos. */
function Feed({ d }: { d: HomeData }) {
  return (
    <div className="home-feed">
      <TickerTape rows={d.assets.slice(0, 20)} />
      <div className="feed-cols">
        <section className="feed-main">
          <h1 className="page-title">Your feed</h1>
          <PostCta signedIn={d.signedIn} />
          {d.hot.length === 0 ? (
            <p className="muted">No posts yet. Start the first one.</p>
          ) : (
            <ol className="feed">
              {d.hot.map((t) => (
                <li key={t.id}>
                  <FeedCard topic={t} me={d.me} />
                </li>
              ))}
            </ol>
          )}
          <p>
            <Link href="/forum">More posts →</Link>
          </p>
        </section>
        <aside className="feed-side">
          <section className="panel">
            <h2>Trending tickers</h2>
            <TrendingList items={d.trending} />
          </section>
          <section className="panel">
            <h2>Who&rsquo;s helping most</h2>
            <LeaderList items={d.leaders} />
          </section>
          <section className="panel">
            <h2>Communities</h2>
            <CommunityList items={d.popular.slice(0, 8)} />
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Trader terminal: dense prices beside the newest discussion, for wide screens. */
function Terminal({ d }: { d: HomeData }) {
  return (
    <div className="home-term">
      <TickerTape rows={d.assets.slice(0, 25)} />
      <h1 className="sr-only">Trader terminal</h1>
      <div className="term-panes">
        <section className="term-pane">
          <h2>Prices</h2>
          {d.assets.length > 0 ? <MarketTable rows={d.assets.slice(0, 40)} /> : <p className="empty">Market data is loading.</p>}
        </section>
        <section className="term-pane">
          {d.movers && (
            <div className="term-movers">
              <div>
                <h2>Gainers</h2>
                <MoverList rows={d.movers.gainers} />
              </div>
              <div>
                <h2>Losers</h2>
                <MoverList rows={d.movers.losers} />
              </div>
            </div>
          )}
          <h2>
            Latest posts <Link href="/forum?sort=new">All</Link>
          </h2>
          <ol className="term-feed">
            {d.fresh.map((t) => (
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
          <h2>Trending</h2>
          <TrendingList items={d.trending.slice(0, 6)} />
        </section>
      </div>
    </div>
  );
}

export function HomeTemplate({ template, data }: { template: Exclude<TemplateId, "markets">; data: HomeData }) {
  if (template === "hub") return <Hub d={data} />;
  if (template === "dashboard") return <Dashboard d={data} />;
  if (template === "feed") return <Feed d={data} />;
  return <Terminal d={data} />;
}
