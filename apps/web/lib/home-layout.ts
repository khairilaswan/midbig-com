/**
 * Page layouts made of blocks, arranged by drag and drop.
 *
 * A "schema" is one kind of page: each community-first home template (hub,
 * dashboard, feed, terminal) and the community page. It has fixed regions,
 * such as a left column or a side bar, and a set of block types allowed in
 * them. Admins set the site's home layouts, members may arrange their own
 * home page, and a community's creator arranges its page. The defaults below
 * reproduce the original fixed pages.
 *
 * Shared by the server (rendering, saving) and the editor in the browser.
 */
import type { TemplateId } from "@midbig/shared";

export type BlockTemplate = Exclude<TemplateId, "markets">;
export type LayoutKey = BlockTemplate | "community";

interface BlockTypeInfo {
  label: string;
  icon: string;
  hint: string;
  limit: { def: number; max: number } | null;
  defaultTitle: string;
  /** Has no heading of its own to edit. */
  noTitle?: boolean;
}

export const BLOCK_TYPES = {
  // Home page and shared blocks
  title: { label: "Page title", icon: "🔠", hint: "The big heading.", limit: null, defaultTitle: "Today on midbig" },
  text: { label: "Text note", icon: "📝", hint: "Your own heading and a short message, such as an announcement.", limit: null, defaultTitle: "Welcome" },
  compose: { label: "New post box", icon: "✏️", hint: "Asks people to share a chart, a call or a question.", limit: null, defaultTitle: "", noTitle: true },
  sortTabs: { label: "Hot / New / Top tabs", icon: "🔀", hint: "Links to the forum's sort orders.", limit: null, defaultTitle: "", noTitle: true },
  hotPosts: { label: "Hot posts", icon: "🔥", hint: "The hottest posts as a list.", limit: { def: 15, max: 50 }, defaultTitle: "Hot posts" },
  postCards: { label: "Post cards", icon: "🖼️", hint: "The hottest posts as big cards with photos.", limit: { def: 15, max: 50 }, defaultTitle: "" },
  latestPosts: { label: "Latest posts", icon: "🆕", hint: "Newest posts, one line each.", limit: { def: 20, max: 50 }, defaultTitle: "Latest posts" },
  yourCommunities: { label: "Your communities", icon: "⭐", hint: "Communities the viewer joined. Hidden when they joined none.", limit: { def: 12, max: 50 }, defaultTitle: "Your communities" },
  popularCommunities: { label: "Popular communities", icon: "👥", hint: "Communities with the most members.", limit: { def: 12, max: 50 }, defaultTitle: "Popular" },
  miniMarket: { label: "Prices list", icon: "💲", hint: "Top assets with price and 24h change.", limit: { def: 10, max: 50 }, defaultTitle: "Markets" },
  marketTable: { label: "Prices table", icon: "📋", hint: "The full price table.", limit: { def: 40, max: 100 }, defaultTitle: "Prices" },
  assetTiles: { label: "Price tiles", icon: "🧱", hint: "Big tiles for the top assets.", limit: { def: 8, max: 24 }, defaultTitle: "" },
  tickerTape: { label: "Ticker tape", icon: "📈", hint: "A strip of live prices.", limit: { def: 20, max: 50 }, defaultTitle: "", noTitle: true },
  gainers: { label: "Top gainers", icon: "🚀", hint: "Biggest 24h risers.", limit: { def: 5, max: 20 }, defaultTitle: "Top gainers" },
  losers: { label: "Top losers", icon: "📉", hint: "Biggest 24h fallers.", limit: { def: 5, max: 20 }, defaultTitle: "Top losers" },
  movers: { label: "Gainers and losers", icon: "↕️", hint: "Both mover lists side by side.", limit: { def: 5, max: 20 }, defaultTitle: "" },
  trending: { label: "Trending tickers", icon: "#️⃣", hint: "Tickers people tagged most today.", limit: { def: 10, max: 30 }, defaultTitle: "Trending tickers" },
  leaders: { label: "Top members", icon: "🏆", hint: "Members whose posts earned the most upvotes this week.", limit: { def: 10, max: 30 }, defaultTitle: "Top this week" },
  // Community page blocks
  posts: { label: "Posts and tabs", icon: "💬", hint: "The community's posts, chat, chart and info tabs. Always on the page.", limit: null, defaultTitle: "", noTitle: true },
  about: { label: "About", icon: "ℹ️", hint: "The community's description.", limit: null, defaultTitle: "About" },
  rules: { label: "Rules", icon: "📜", hint: "The community's rules and the site rules.", limit: null, defaultTitle: "Community rules" },
  sentiment: { label: "Bull / bear meter", icon: "🐂", hint: "Bullish and bearish calls this week.", limit: null, defaultTitle: "", noTitle: true },
  price: { label: "Price", icon: "💵", hint: "The asset's live price and 24h change. Asset communities only.", limit: null, defaultTitle: "Price" },
  chart: { label: "Chart", icon: "📊", hint: "The asset's price chart. Asset communities only.", limit: null, defaultTitle: "" },
  chat: { label: "Live chat", icon: "🗨️", hint: "The community's chat room.", limit: null, defaultTitle: "" },
  mods: { label: "Moderators", icon: "🛡️", hint: "Who runs this community.", limit: null, defaultTitle: "Moderators" },
  bots: { label: "Bot tips", icon: "🤖", hint: "Reminds people they can @mention the bots.", limit: null, defaultTitle: "", noTitle: true },
} as const satisfies Record<string, BlockTypeInfo>;

export type BlockType = keyof typeof BLOCK_TYPES;
export const BLOCK_TYPE_IDS = Object.keys(BLOCK_TYPES) as BlockType[];

export interface Block {
  /** Stable key for the editor and React lists. */
  id: string;
  type: BlockType;
  /** Heading shown above the block. Empty for none. */
  title: string;
  /** How many rows, for blocks that list things. */
  limit?: number;
  /** The message of a text note. */
  text?: string;
  /** Two columns wide, in the dashboard's card grid. */
  wide?: boolean;
}

export interface RegionInfo {
  id: string;
  label: string;
}

export type TemplateLayout = Record<string, Block[]>;

export interface LayoutSchema {
  name: string;
  blurb: string;
  regions: RegionInfo[];
  types: BlockType[];
  /** Blocks that must stay on the page: they can move but not be removed. */
  required: BlockType[];
  /** The region with a two-columns-wide option. */
  wideRegion?: string;
}

const HOME_TYPES: BlockType[] = [
  "title",
  "text",
  "compose",
  "sortTabs",
  "hotPosts",
  "postCards",
  "latestPosts",
  "yourCommunities",
  "popularCommunities",
  "miniMarket",
  "marketTable",
  "assetTiles",
  "tickerTape",
  "gainers",
  "losers",
  "movers",
  "trending",
  "leaders",
];

const COMMUNITY_TYPES: BlockType[] = ["posts", "about", "rules", "sentiment", "price", "chart", "chat", "mods", "bots", "text", "trending", "popularCommunities", "leaders"];

export const SCHEMAS: Record<LayoutKey, LayoutSchema> = {
  hub: {
    name: "Community hub",
    blurb: "A forum front page: hot posts in the middle, communities on the left, markets on the right.",
    regions: [
      { id: "left", label: "Left column" },
      { id: "main", label: "Middle column" },
      { id: "right", label: "Right column" },
    ],
    types: HOME_TYPES,
    required: [],
  },
  dashboard: {
    name: "Dashboard",
    blurb: "Tiles for top assets, movers, trending tickers, hot posts and top members at a glance.",
    regions: [
      { id: "top", label: "Top, full width" },
      { id: "grid", label: "Card grid" },
    ],
    types: HOME_TYPES,
    required: [],
    wideRegion: "grid",
  },
  feed: {
    name: "Social feed",
    blurb: "One column of posts with photos, like a social app, with a live ticker tape on top.",
    regions: [
      { id: "top", label: "Top, full width" },
      { id: "main", label: "Main column" },
      { id: "side", label: "Side bar" },
    ],
    types: HOME_TYPES,
    required: [],
  },
  terminal: {
    name: "Trader terminal",
    blurb: "Dense two-pane screen: compact prices beside the live discussion, for big monitors.",
    regions: [
      { id: "top", label: "Top, full width" },
      { id: "left", label: "Left pane" },
      { id: "right", label: "Right pane" },
    ],
    types: HOME_TYPES,
    required: [],
  },
  community: {
    name: "Community page",
    blurb: "The header stays on top. Arrange what sits above the tabs, beside the posts and in the side bar.",
    regions: [
      { id: "top", label: "Above the tabs" },
      { id: "main", label: "Main column" },
      { id: "side", label: "Side bar" },
    ],
    types: COMMUNITY_TYPES,
    required: ["posts"],
  },
};

export const BLOCK_TEMPLATES: BlockTemplate[] = ["hub", "dashboard", "feed", "terminal"];
/** Kept for callers that only need a template's regions. */
export const REGIONS = Object.fromEntries(BLOCK_TEMPLATES.map((t) => [t, SCHEMAS[t].regions])) as Record<BlockTemplate, RegionInfo[]>;

export type HomeLayouts = Record<BlockTemplate, TemplateLayout>;

export const MAX_BLOCKS_PER_REGION = 20;
export const TEXT_MAX = 600;
export const TITLE_MAX = 80;

let seq = 0;
export function newBlockId(): string {
  seq += 1;
  return `b${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function newBlock(type: BlockType): Block {
  const info: BlockTypeInfo = BLOCK_TYPES[type];
  const b: Block = { id: newBlockId(), type, title: info.defaultTitle };
  if (info.limit) b.limit = info.limit.def;
  if (type === "text") b.text = "";
  return b;
}

function b(type: BlockType, title: string = BLOCK_TYPES[type].defaultTitle, extra: Partial<Block> = {}): Block {
  const info: BlockTypeInfo = BLOCK_TYPES[type];
  return { id: `${type}-${title || "x"}-${extra.limit ?? ""}`.replace(/\W+/g, "-"), type, title, ...(info.limit ? { limit: info.limit.def } : {}), ...extra };
}

/** The original fixed pages, as blocks. */
export const DEFAULT_LAYOUTS: Record<LayoutKey, TemplateLayout> = {
  hub: {
    left: [b("yourCommunities"), b("popularCommunities")],
    main: [b("title", "Today on midbig"), b("compose"), b("sortTabs"), b("hotPosts", "")],
    right: [b("miniMarket"), b("trending"), b("leaders")],
  },
  dashboard: {
    top: [b("title", "Market dashboard"), b("assetTiles")],
    grid: [b("gainers"), b("losers"), b("trending", "Trending tickers", { limit: 8 }), b("hotPosts", "Hot posts", { limit: 6, wide: true }), b("leaders", "Top members this week", { limit: 8 })],
  },
  feed: {
    top: [b("tickerTape")],
    main: [b("title", "Your feed"), b("compose"), b("postCards")],
    side: [b("trending"), b("leaders", "Who’s helping most"), b("popularCommunities", "Communities", { limit: 8 })],
  },
  terminal: {
    top: [b("tickerTape", "", { limit: 25 })],
    left: [b("marketTable")],
    right: [b("movers"), b("latestPosts"), b("trending", "Trending", { limit: 6 })],
  },
  community: {
    top: [b("sentiment")],
    main: [b("posts")],
    side: [b("about"), b("rules"), b("bots")],
  },
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function normalizeBlock(raw: unknown, schema: LayoutSchema, region: string): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as BlockType;
  if (!schema.types.includes(type)) return null;
  const info: BlockTypeInfo = BLOCK_TYPES[type];
  const id = typeof r.id === "string" && /^[\w-]{1,60}$/.test(r.id) ? r.id : newBlockId();
  const block: Block = { id, type, title: info.noTitle ? "" : str(r.title, TITLE_MAX) };
  if (info.limit) {
    const n = Math.floor(Number(r.limit));
    block.limit = Number.isFinite(n) ? Math.max(1, Math.min(info.limit.max, n)) : info.limit.def;
  }
  if (type === "text") {
    // Keep line breaks in the message, but tidy the rest.
    block.text = typeof r.text === "string" ? r.text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, TEXT_MAX) : "";
  }
  if (schema.wideRegion === region && r.wide === true) block.wide = true;
  return block;
}

/**
 * Fixes one page's layout: known regions and allowed block types only, ids
 * unique, limits in range, required blocks present exactly once.
 */
export function normalizeLayout(key: LayoutKey, raw: unknown): TemplateLayout {
  const schema = SCHEMAS[key];
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!src) return DEFAULT_LAYOUTS[key];
  const out: TemplateLayout = {};
  const seen = new Set<string>();
  const have = new Set<BlockType>();
  for (const region of schema.regions) {
    const list = Array.isArray(src[region.id]) ? (src[region.id] as unknown[]) : [];
    out[region.id] = [];
    for (const item of list.slice(0, MAX_BLOCKS_PER_REGION)) {
      const block = normalizeBlock(item, schema, region.id);
      if (!block) continue;
      if (schema.required.includes(block.type) && have.has(block.type)) continue;
      have.add(block.type);
      if (seen.has(block.id)) block.id = newBlockId();
      seen.add(block.id);
      out[region.id]!.push(block);
    }
  }
  for (const type of schema.required) {
    if (have.has(type)) continue;
    const home = Object.entries(DEFAULT_LAYOUTS[key]).find(([, l]) => l.some((x) => x.type === type))?.[0] ?? schema.regions[0]!.id;
    out[home] = [...(out[home] ?? []), newBlock(type)];
  }
  return out;
}

/** @deprecated name kept for the admin save path. */
export const normalizeTemplateLayout = (template: BlockTemplate, raw: unknown) => normalizeLayout(template, raw);

/** Every template's layout from what's stored, with the given fallback for templates never edited. */
export function normalizeLayouts(raw: unknown, fallback: HomeLayouts = DEFAULT_LAYOUTS): HomeLayouts {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as HomeLayouts;
  for (const t of BLOCK_TEMPLATES) out[t] = src[t] ? normalizeLayout(t, src[t]) : fallback[t];
  return out;
}

/** The biggest row count any block of these types asks for, or 0 when none is used. */
export function needs(layout: TemplateLayout, types: BlockType[]): number {
  let n = 0;
  for (const list of Object.values(layout)) {
    for (const block of list) if (types.includes(block.type)) n = Math.max(n, block.limit ?? 1);
  }
  return n;
}

export const hasBlock = (layout: TemplateLayout, type: BlockType) => Object.values(layout).some((l) => l.some((x) => x.type === type));

/** Who may arrange their own pages; the admin's switches in the portal. */
export interface LayoutEditing {
  members: boolean;
  communities: boolean;
}
