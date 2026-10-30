import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  assetPath,
  bullShare,
  formatAssetPrice,
  NAMESPACES,
  parseSort,
  parseWindow,
  type Namespace,
} from "@midbig/shared";
import { StockHeader, ForexHeader } from "@/components/asset-header";
import { ChatRoom } from "@/components/chat";
import { CoinHeader } from "@/components/coin-header";
import { CommunityEditForm, JoinButton } from "@/components/community";
import { Pager, SortTabs, sortQuery, TopicList } from "@/components/forum-list";
import { PriceChart } from "@/components/price-chart";
import { WatchButton } from "@/components/watch-button";
import { isAdmin } from "@/lib/admin";
import { chatRoomFor, communityMods, getCommunity, membership, sentiment, type Community } from "@/lib/communities";
import { forumViewer, listTopics } from "@/lib/forum";
import { getAsset } from "@/lib/server";
import { classEnabled } from "@/lib/settings";
import { isWatched } from "@/lib/user-data";

export type CommunityProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; sort?: string; t?: string; page?: string }>;
};

const TABS = { forum: "Forum", chart: "Chart", chat: "Chat", info: "Info" } as const;
type Tab = keyof typeof TABS;

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
  const tab: Tab = sp.tab && Object.hasOwn(TABS, sp.tab) ? (sp.tab as Tab) : "forum";
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
        </div>
      </header>
      {c.ns === "m" && (
        <p className="notice small">
          m/ communities are made by members and cover smaller, riskier coins. Check contract addresses yourself and
          never send money to anyone you meet here.
        </p>
      )}
      <Sentiment bulls={mood.bulls} bears={mood.bears} />

      <nav className="tabs community-tabs" aria-label="Community">
        {(Object.keys(TABS) as Tab[])
          .filter((t) => t !== "chart" || c.assetId)
          .map((t) => (
            <Link key={t} href={t === "forum" ? c.path : `${c.path}?tab=${t}`} aria-current={tab === t ? "page" : undefined}>
              {TABS[t]}
            </Link>
          ))}
      </nav>

      <div className="forum-cols">
        <section>
          {tab === "forum" && (
            <ForumTab c={c} me={me} sort={sort} window={window} page={page} viewerId={viewer?.id} />
          )}
          {tab === "chat" && <ChatRoom room={chatRoomFor(c)} title={`${c.label} chat`} tall />}
          {tab === "chart" && asset && (
            <>
              {asset.assetClass === "stock" ? <StockHeader asset={asset} /> : asset.assetClass === "forex" ? <ForexHeader asset={asset} /> : <CoinHeader asset={asset} />}
              <div className="coin-actions">
                <WatchButton
                  assetId={asset.id}
                  name={asset.name}
                  initial={viewer ? await isWatched(viewer.id, asset.id) : false}
                  signedIn={!!viewer}
                />
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
        </section>
        <aside className="panel community-side">
          <h2>About</h2>
          <p className="small">{c.description ?? `The ${c.label} community: ideas, analysis and questions about ${c.title}.`}</p>
          {c.rules && (
            <>
              <h3 className="small-head">Community rules</h3>
              <ol className="small rules-list">
                {c.rules
                  .split("\n")
                  .map((r) => r.trim())
                  .filter(Boolean)
                  .map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
              </ol>
            </>
          )}
          <p className="small muted">
            Plus the <Link href="/rules">site rules</Link>. Ask a bot: <code>@pricebot</code>, <code>@riskbot</code>,{" "}
            <code>@pulsebot</code>.
          </p>
          {role === "mod" && !me?.canModerate && (
            <p className="small notice">
              You moderate this community. Turn on <Link href="/account#two-factor">two-factor login</Link> to edit it
              and remove posts.
            </p>
          )}
          {(me?.canModerate || isAdmin(viewer)) && (
            <CommunityEditForm
              community={{ id: c.id, slug: c.slug, title: c.title, description: c.description, rules: c.rules }}
              isAdmin={isAdmin(viewer)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

async function ForumTab({
  c,
  me,
  sort,
  window,
  page,
  viewerId,
}: {
  c: Community;
  me: Awaited<ReturnType<typeof forumViewer>>["me"];
  sort: ReturnType<typeof parseSort>;
  window: ReturnType<typeof parseWindow>;
  page: number;
  viewerId?: string;
}) {
  const { topics, hasMore } = await listTopics({ communityId: c.id, sort, window, page, viewerId });
  return (
    <>
      <SortTabs path={c.path} sort={sort} window={window} />
      <TopicList topics={topics} me={me} showCommunity={false} empty={`Nothing in ${c.label} yet. Start the first topic.`} />
      <Pager base={`${c.path}${sortQuery(sort, window)}`} page={page} hasMore={hasMore} />
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
