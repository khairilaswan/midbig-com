import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  FLAIRS,
  isFlair,
  type Flair,
  assetPath,
  bullShare,
  formatAssetPrice,
  NAMESPACES,
  parseSort,
  parseWindow,
  type Namespace,
  profilePath,
} from "@midbig/shared";
import { StockHeader, ForexHeader } from "@/components/asset-header";
import { ChatRoom } from "@/components/chat";
import { CoinHeader } from "@/components/coin-header";
import { CommunityEditForm, JoinButton } from "@/components/community";
import { Pager, SortTabs, sortQuery, TopicList } from "@/components/forum-list";
import { PriceChart } from "@/components/price-chart";
import { WatchButton } from "@/components/watch-button";
import { saveCommunityLayout } from "@/app/layout-actions";
import { MiniMarket } from "@/components/home-live";
import { LayoutEditor } from "@/components/home-layout-editor";
import { Avatar } from "@/components/avatar";
import { hasBlock, type Block, type TemplateLayout } from "@/lib/home-layout";
import { canEditCommunityLayout, communityLayout } from "@/lib/home-layout-store";
import { trendingTickers, weeklyLeaders, type Leader, type TrendingTicker } from "@/lib/social";
import { isAdmin } from "@/lib/admin";
import { chatRoomFor, communityMods, getCommunity, listCommunities, membership, sentiment, type Community } from "@/lib/communities";
import { forumViewer, listTopics } from "@/lib/forum";
import { getAsset } from "@/lib/server";
import { classEnabled } from "@/lib/settings";
import { isWatched } from "@/lib/user-data";

export type CommunityProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; sort?: string; t?: string; page?: string; flair?: string }>;
};

const TABS = { forum: "Forum", chart: "Chart", chat: "Chat", info: "Info" } as const;
type Tab = keyof typeof TABS | "layout";

async function load(ns: Namespace, slug: string): Promise<Community | null> {
  const c = await getCommunity(ns, decodeURIComponent(slug));
  if (!c || c.status !== "active" || !(await classEnabled(c.assetClass))) return null;
  return c;
}

export async function communityMetadata(ns: Namespace, { params }: CommunityProps): Promise<Metadata> {
  const c = await load(ns, (await params).slug);
  if (!c) return { title: "Community not found", robots: { index: false } };
  const about = c.symbol && c.kind !== "hub" ? `${c.title} (${c.symbol})` : c.title;
  return {
    title: `${c.label}: ${about} community, chat and chart`,
    description:
      c.description ??
      `Discuss ${about} with other traders on midbig: ideas, analysis and live chat, with up and down votes. Not financial advice.`,
    alternates: { canonical: c.path },
    // m/ communities are member-made; keep the young ones out of search until they've proven themselves.
    robots: ns === "m" && c.topicCount < 5 ? { index: false } : undefined,
  };
}

function Sentiment({ bulls, bears }: { bulls: number; bears: number }) {
  const share = bullShare(bulls, bears);
  return (
    <div className="sentiment" title="Bullish and bearish calls in this community's topics over the last 7 days">
      <div className={`sentiment-bar${share == null ? " empty" : ""}`} aria-hidden>
        {share != null && <span className="bull" style={{ width: `${share}%` }} />}
      </div>
      <span className="small muted">
        {share == null
          ? "Not enough calls this week for a bull/bear reading"
          : `${share}% bullish · ${bulls} bull, ${bears} bear calls this week`}
      </span>
    </div>
  );
}

export async function CommunityPage({ ns, props }: { ns: Namespace; props: CommunityProps }) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const c = await load(ns, slug);
  if (!c) notFound();
  if (decodeURIComponent(slug) !== c.path.slice(3)) permanentRedirect(c.path);
  let tab: Tab = sp.tab === "layout" || (sp.tab && Object.hasOwn(TABS, sp.tab)) ? (sp.tab as Tab) : "forum";
  const sort = parseSort(sp.sort);
  const window = parseWindow(sp.t);
  const page = Math.max(1, Number(sp.page) || 1);

  const { viewer, me } = await forumViewer(c.id);
  const [role, mood, mods, asset] = await Promise.all([
    membership(viewer?.id, c.id),
    sentiment(c.id),
    communityMods(c.id),
    c.assetId ? getAsset(c.assetId) : null,
  ]);
  const price = asset ? (asset.live?.p ?? asset.refPrice) : null;
  const canArrange = await canEditCommunityLayout(viewer, c);
  if (tab === "layout" && !canArrange) tab = "forum";
  const layout = communityLayout(c.layout);
  const [trending, popular, leaders] = await Promise.all([
    hasBlock(layout, "trending") ? trendingTickers(Math.max(...blocksOf(layout, "trending").map((b) => b.limit ?? 10))) : [],
    hasBlock(layout, "popularCommunities") ? listCommunities({ sort: "members", limit: 50 }) : [],
    hasBlock(layout, "leaders") ? weeklyLeaders(30) : [],
  ]);
  const watched = tab === "chart" && asset && viewer ? await isWatched(viewer.id, asset.id) : false;
  const ctx: SideCtx = { c, mood, mods, asset, tab, trending, popular, leaders };

  return (
    <div className="community">
      <header className="community-head">
        {c.image ? <img src={c.image} alt="" width={48} height={48} className="logo big-logo" /> : <span className="logo-fallback big-logo">{(c.symbol ?? c.title).slice(0, 1)}</span>}
        <div className="community-title">
          <h1 className="page-title">
            {c.label} <span className="muted community-sub">{c.title}</span>
          </h1>
          <p className="muted small">
            <span className={`ns-tag ns-${c.ns}`} title={NAMESPACES[c.ns].blurb}>
              {c.ns === "b" ? "Big" : "Mid"}
            </span>{" "}
            {c.memberCount.toLocaleString("en-US")} {c.memberCount === 1 ? "member" : "members"} · {c.topicCount.toLocaleString("en-US")} {c.topicCount === 1 ? "topic" : "topics"}
            {asset && price != null && (
              <>
                {" · "}
                <Link href={assetPath(asset.id)}>
                  {asset.symbol} {formatAssetPrice(asset.id, price)}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="community-actions">
          <JoinButton communityId={c.id} joined={role != null} role={role} signedIn={!!viewer} />
          <Link href={`/forum/new?community=${c.id}`} className="btn small secondary">
            + Post
          </Link>
          {canArrange && (
            <Link href={tab === "layout" ? c.path : `${c.path}?tab=layout`} className="btn small secondary">
              {tab === "layout" ? "Done arranging" : "✎ Arrange page"}
            </Link>
          )}
        </div>
      </header>
      {c.ns === "m" && (
        <p className="notice small">
          m/ communities are made by members and cover smaller, riskier coins. Check contract addresses yourself and
          never send money to anyone you meet here.
        </p>
      )}
      {tab === "layout" ? (
        <section className="panel">
          <h2>Arrange this page</h2>
          <LayoutEditor
            pages={[{ key: "community", schema: "community", label: c.label, previewHref: c.path }]}
            layouts={{ community: layout }}
            save={saveCommunityLayout.bind(null, c.id)}
            resetLabel="Use the standard layout"
          />
        </section>
      ) : (
        <>
          <BlockList blocks={layout.top} ctx={ctx} />

          <nav className="tabs community-tabs" aria-label="Community">
            {(Object.keys(TABS) as (keyof typeof TABS)[])
              .filter((t) => t !== "chart" || c.assetId)
              .map((t) => (
                <Link key={t} href={t === "forum" ? c.path : `${c.path}?tab=${t}`} aria-current={tab === t ? "page" : undefined}>
                  {TABS[t]}
                </Link>
              ))}
          </nav>

          <div className={`forum-cols${(layout.side ?? []).length === 0 && !me?.canModerate && !isAdmin(viewer) ? " no-side" : ""}`}>
            <section>
              {(layout.main ?? []).map((block) =>
                block.type === "posts" ? (
                  <div key={block.id} className="community-posts">
                    {tab === "forum" && (
                      <ForumTab c={c} me={me} sort={sort} window={window} page={page} viewerId={viewer?.id} flair={isFlair(sp.flair) ? sp.flair : null} />
                    )}
                    {tab === "chat" && <ChatRoom room={chatRoomFor(c)} title={`${c.label} chat`} tall />}
                    {tab === "chart" && asset && (
                      <>
                        {asset.assetClass === "stock" ? <StockHeader asset={asset} /> : asset.assetClass === "forex" ? <ForexHeader asset={asset} /> : <CoinHeader asset={asset} />}
                        <div className="coin-actions">
                          <WatchButton assetId={asset.id} name={asset.name} initial={watched} signedIn={!!viewer} />
                          <Link href={`/alerts?coin=${asset.id}`} className="btn secondary small">
                            🔔 Price alert
                          </Link>
                          {asset.assetClass !== "forex" && (
                            <Link href={`/portfolio?add=${asset.id}`} className="btn secondary small">
                              + Add to portfolio
                            </Link>
                          )}
                          <Link href="/what-if" className="btn secondary small">
                            What if…
                          </Link>
                        </div>
                        <PriceChart id={asset.id} initialLive={asset.live} />
                      </>
                    )}
                    {tab === "info" && <InfoTab c={c} asset={asset ? { id: asset.id, name: asset.name } : null} mods={mods} />}
                  </div>
                ) : (
                  <BlockList key={block.id} blocks={[block]} ctx={ctx} />
                ),
              )}
            </section>
            <aside className="community-side">
              <BlockList blocks={layout.side} ctx={ctx} boxed />
              {role === "mod" && !me?.canModerate && (
                <p className="small notice">
                  You moderate this community. Turn on <Link href="/account#two-factor">two-factor login</Link> to edit it
                  and remove posts.
                </p>
              )}
              {(me?.canModerate || isAdmin(viewer)) && (
                <div className="panel">
                  <CommunityEditForm
                    community={{ id: c.id, slug: c.slug, title: c.title, description: c.description, rules: c.rules }}
                    isAdmin={isAdmin(viewer)}
                  />
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

const blocksOf = (layout: TemplateLayout, type: Block["type"]) => Object.values(layout).flatMap((l) => l.filter((b) => b.type === type));

interface SideCtx {
  c: Community;
  mood: { bulls: number; bears: number };
  mods: { id: string; name: string }[];
  asset: Awaited<ReturnType<typeof getAsset>>;
  tab: Tab;
  trending: TrendingTicker[];
  popular: Community[];
  leaders: Leader[];
}

/** The creator's blocks for one region of the community page. `boxed` puts each in a panel. */
function BlockList({ blocks, ctx, boxed = false }: { blocks: Block[] | undefined; ctx: SideCtx; boxed?: boolean }) {
  return (
    <>
      {(blocks ?? []).map((block) => {
        const body = communityBlock(block, ctx);
        if (body == null) return null;
        return boxed ? (
          <section key={block.id} className="panel community-block">
            {body}
          </section>
        ) : (
          <div key={block.id} className="community-block">
            {body}
          </div>
        );
      })}
    </>
  );
}

function communityBlock(block: Block, { c, mood, mods, asset, tab, trending, popular, leaders }: SideCtx): React.ReactNode {
  const h = block.title ? <h2>{block.title}</h2> : null;
  const n = block.limit ?? 10;
  switch (block.type) {
    case "sentiment":
      return <Sentiment bulls={mood.bulls} bears={mood.bears} />;
    case "about":
      return (
        <>
          {h}
          <p className="small">{c.description ?? `The ${c.label} community: ideas, analysis and questions about ${c.title}.`}</p>
        </>
      );
    case "rules":
      return (
        <>
          {h}
          {c.rules && (
            <ol className="small rules-list">
              {c.rules
                .split("\n")
                .map((r) => r.trim())
                .filter(Boolean)
                .map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
            </ol>
          )}
          <p className="small muted">
            {c.rules ? "Plus the " : "The "}
            <Link href="/rules">site rules</Link> apply.
          </p>
        </>
      );
    case "bots":
      return (
        <p className="small muted">
          Ask a bot: <code>@pricebot</code>, <code>@riskbot</code>, <code>@pulsebot</code>.
        </p>
      );
    case "price":
      if (!asset) return null;
      return (
        <>
          {h}
          <MiniMarket rows={[asset]} />
        </>
      );
    case "chart":
      if (!asset || tab === "chart") return null;
      return (
        <>
          {h}
          <PriceChart id={asset.id} initialLive={asset.live} />
        </>
      );
    case "chat":
      if (tab === "chat") return null;
      return (
        <>
          {h}
          <ChatRoom room={chatRoomFor(c)} title={block.title || `${c.label} chat`} />
        </>
      );
    case "mods":
      return (
        <>
          {h}
          <p className="small">
            {mods.length === 0
              ? "Run by midbig staff."
              : mods.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ", "}
                    <Link href={profilePath(m.name)}>{m.name}</Link>
                  </span>
                ))}
          </p>
        </>
      );
    case "text":
      return (
        <div className="home-note">
          {h}
          {block.text && block.text.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
        </div>
      );
    case "trending":
      return (
        <>
          {h}
          {trending.length === 0 ? (
            <p className="muted small">No tickers tagged today yet.</p>
          ) : (
            <ol className="trending">
              {trending.slice(0, n).map((t) => (
                <li key={t.symbol}>
                  <Link href={t.href} className="ticker-tag">
                    ${t.symbol}
                  </Link>{" "}
                  <span className="muted small">{t.posts} posts</span>
                </li>
              ))}
            </ol>
          )}
        </>
      );
    case "popularCommunities":
      return (
        <>
          {h}
          <ul className="community-mini">
            {popular
              .filter((p) => p.id !== c.id)
              .slice(0, n)
              .map((p) => (
                <li key={p.id}>
                  <Link href={p.path}>{p.label}</Link> <span className="muted small">{p.memberCount.toLocaleString("en-US")}</span>
                </li>
              ))}
          </ul>
        </>
      );
    case "leaders":
      return (
        <>
          {h}
          {leaders.length === 0 ? (
            <p className="muted small">Upvote useful posts and their authors show up here.</p>
          ) : (
            <ol className="leaders">
              {leaders.slice(0, n).map((m) => (
                <li key={m.id}>
                  <Link href={profilePath(m.name)}>
                    <Avatar name={m.name} src={m.avatar} size={22} /> {m.name}
                  </Link>{" "}
                  <span className="muted small">+{m.points}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      );
    default:
      return null;
  }
}

async function ForumTab({
  c,
  me,
  sort,
  window,
  page,
  viewerId,
  flair,
}: {
  c: Community;
  me: Awaited<ReturnType<typeof forumViewer>>["me"];
  sort: ReturnType<typeof parseSort>;
  window: ReturnType<typeof parseWindow>;
  page: number;
  viewerId?: string;
  flair: Flair | null;
}) {
  const { topics, hasMore } = await listTopics({ communityId: c.id, sort, window, page, viewerId, flair });
  const extra: Record<string, string> = flair ? { flair } : {};
  const sortHref = (f: Flair | null) => {
    const q = sortQuery(sort, window, f ? { flair: f } : {});
    return `${c.path}${q}`;
  };
  return (
    <>
      <SortTabs path={c.path} sort={sort} window={window} extra={extra} />
      <nav className="flair-filter small" aria-label="Filter by flair">
        <Link href={sortHref(null)} aria-current={!flair ? "page" : undefined}>
          All
        </Link>
        {(Object.keys(FLAIRS) as Flair[]).map((f) => (
          <Link key={f} href={sortHref(f)} aria-current={flair === f ? "page" : undefined} className={`flair flair-${f}`}>
            {FLAIRS[f].emoji} {FLAIRS[f].label}
          </Link>
        ))}
      </nav>
      <TopicList
        topics={topics}
        me={me}
        showCommunity={false}
        empty={flair ? `No ${FLAIRS[flair].label.toLowerCase()} posts in ${c.label} yet.` : `Nothing in ${c.label} yet. Start the first topic.`}
      />
      <Pager base={`${c.path}${sortQuery(sort, window, extra)}`} page={page} hasMore={hasMore} />
    </>
  );
}

function InfoTab({ c, asset, mods }: { c: Community; asset: { id: string; name: string } | null; mods: { id: string; name: string }[] }) {
  return (
    <div className="panel">
      <dl className="stats">
        <div>
          <dt>Community</dt>
          <dd>
            {c.label} ({c.kind === "hub" ? "topic hub" : c.kind === "token" ? "unlisted token" : "listed asset"})
          </dd>
        </div>
        {c.symbol && (
          <div>
            <dt>Ticker</dt>
            <dd>{c.symbol}</dd>
          </div>
        )}
        <div>
          <dt>Created</dt>
          <dd>{new Date(c.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</dd>
        </div>
        <div>
          <dt>Moderators</dt>
          <dd>
            {mods.length === 0
              ? "midbig staff"
              : mods.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && ", "}
                    <Link href={`/u/${encodeURIComponent(m.name)}`}>{m.name}</Link>
                  </span>
                ))}
          </dd>
        </div>
        {c.tokenInfo.chain && (
          <div>
            <dt>Chain</dt>
            <dd>{c.tokenInfo.chain}</dd>
          </div>
        )}
        {c.tokenInfo.contract && (
          <div>
            <dt>Contract</dt>
            <dd className="mono">{c.tokenInfo.contract}</dd>
          </div>
        )}
        {c.tokenInfo.website && (
          <div>
            <dt>Website</dt>
            <dd>
              <a href={c.tokenInfo.website} rel="nofollow ugc noopener noreferrer" target="_blank">
                {c.tokenInfo.website.replace(/^https:\/\//, "")}
              </a>
            </dd>
          </div>
        )}
      </dl>
      {c.kind === "token" && (
        <p className="notice small">
          A member added these details and midbig hasn&rsquo;t checked them. Scammers copy popular tokens; confirm the
          contract on the project&rsquo;s own channels before you trade.
        </p>
      )}
      {asset && (
        <p>
          Full figures on the <Link href={assetPath(asset.id)}>{asset.name} page</Link>.
        </p>
      )}
    </div>
  );
}
