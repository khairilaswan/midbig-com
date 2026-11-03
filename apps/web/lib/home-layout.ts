/**
 * Home page layouts made of blocks. Each community-first template (hub,
 * dashboard, feed, terminal) has fixed regions, such as a left column or a
 * side bar, and the admin decides which blocks go in each region and in what
 * order. The defaults below reproduce the original fixed templates.
 *
 * Shared by the server (rendering, saving) and the admin editor in the browser.
 */
import type { TemplateId } from "@midbig/shared";

export type BlockTemplate = Exclude<TemplateId, "markets">;

export const BLOCK_TYPES = {
  title: { label: "Page title", hint: "The big heading.", limit: null, defaultTitle: "Today on midbig" },
  text: { label: "Text note", hint: "Your own heading and a short message, such as an announcement.", limit: null, defaultTitle: "Welcome" },
  compose: { label: "New post box", hint: "Asks people to share a chart, a call or a question.", limit: null, defaultTitle: "" },
  sortTabs: { label: "Hot / New / Top tabs", hint: "Links to the forum's sort orders.", limit: null, defaultTitle: "" },
  hotPosts: { label: "Hot posts (list)", hint: "The hottest posts as a list.", limit: { def: 15, max: 50 }, defaultTitle: "Hot posts" },
  postCards: { label: "Hot posts (cards with photos)", hint: "The hottest posts as big cards.", limit: { def: 15, max: 50 }, defaultTitle: "" },
  latestPosts: { label: "Latest posts (compact)", hint: "Newest posts, one line each.", limit: { def: 20, max: 50 }, defaultTitle: "Latest posts" },
  yourCommunities: { label: "Your communities", hint: "Communities the viewer joined. Hidden when they joined none.", limit: { def: 12, max: 50 }, defaultTitle: "Your communities" },
  popularCommunities: { label: "Popular communities", hint: "Communities with the most members.", limit: { def: 12, max: 50 }, defaultTitle: "Popular" },
  miniMarket: { label: "Prices (small list)", hint: "Top assets with price and 24h change.", limit: { def: 10, max: 50 }, defaultTitle: "Markets" },
  marketTable: { label: "Prices (full table)", hint: "The full price table.", limit: { def: 40, max: 100 }, defaultTitle: "Prices" },
  assetTiles: { label: "Price tiles", hint: "Big tiles for the top assets.", limit: { def: 8, max: 24 }, defaultTitle: "" },
  tickerTape: { label: "Ticker tape", hint: "A scrolling strip of live prices.", limit: { def: 20, max: 50 }, defaultTitle: "" },
  gainers: { label: "Top gainers", hint: "Biggest 24h risers.", limit: { def: 5, max: 20 }, defaultTitle: "Top gainers" },
  losers: { label: "Top losers", hint: "Biggest 24h fallers.", limit: { def: 5, max: 20 }, defaultTitle: "Top losers" },
  movers: { label: "Gainers and losers side by side", hint: "Both mover lists in one block.", limit: { def: 5, max: 20 }, defaultTitle: "" },
  trending: { label: "Trending tickers", hint: "Tickers people tagged most today.", limit: { def: 10, max: 30 }, defaultTitle: "Trending tickers" },
  leaders: { label: "Top members this week", hint: "Members whose posts earned the most upvotes.", limit: { def: 10, max: 30 }, defaultTitle: "Top this week" },
} as const;

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

/** Each template's regions, in page order. The CSS for each template lays these out. */
export const REGIONS: Record<BlockTemplate, RegionInfo[]> = {
  hub: [
    { id: "left", label: "Left column" },
    { id: "main", label: "Middle column" },
    { id: "right", label: "Right column" },
  ],
  dashboard: [
    { id: "top", label: "Top, full width" },
    { id: "grid", label: "Card grid" },
  ],
  feed: [
    { id: "top", label: "Top, full width" },
    { id: "main", label: "Main column" },
    { id: "side", label: "Side bar" },
  ],
  terminal: [
    { id: "top", label: "Top, full width" },
    { id: "left", label: "Left pane" },
    { id: "right", label: "Right pane" },
  ],
};

export const BLOCK_TEMPLATES = Object.keys(REGIONS) as BlockTemplate[];

export type TemplateLayout = Record<string, Block[]>;
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
  const info = BLOCK_TYPES[type];
  const b: Block = { id: newBlockId(), type, title: info.defaultTitle };
  if (info.limit) b.limit = info.limit.def;
  if (type === "text") b.text = "";
  return b;
}

function b(type: BlockType, title: string = BLOCK_TYPES[type].defaultTitle, extra: Partial<Block> = {}): Block {
  const info = BLOCK_TYPES[type];
  return { id: `${type}-${title || "x"}-${extra.limit ?? ""}`.replace(/\W+/g, "-"), type, title, ...(info.limit ? { limit: info.limit.def } : {}), ...extra };
}

/** The original fixed templates, as blocks. */
export const DEFAULT_LAYOUTS: HomeLayouts = {
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
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function normalizeBlock(raw: unknown, template: BlockTemplate, region: string): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as BlockType;
  if (!BLOCK_TYPE_IDS.includes(type)) return null;
  const info = BLOCK_TYPES[type];
  const id = typeof r.id === "string" && /^[\w-]{1,60}$/.test(r.id) ? r.id : newBlockId();
  const block: Block = { id, type, title: str(r.title, TITLE_MAX) };
  if (info.limit) {
    const n = Math.floor(Number(r.limit));
    block.limit = Number.isFinite(n) ? Math.max(1, Math.min(info.limit.max, n)) : info.limit.def;
  }
  if (type === "text") {
    // Keep line breaks in the message, but tidy the rest.
    block.text = typeof r.text === "string" ? r.text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, TEXT_MAX) : "";
  }
  if (template === "dashboard" && region === "grid" && r.wide === true) block.wide = true;
  return block;
}

/** Fixes one template's layout: known regions and block types only, ids unique, limits in range. */
export function normalizeTemplateLayout(template: BlockTemplate, raw: unknown): TemplateLayout {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!src) return DEFAULT_LAYOUTS[template];
  const out: TemplateLayout = {};
  const seen = new Set<string>();
  for (const region of REGIONS[template]) {
    const list = Array.isArray(src[region.id]) ? (src[region.id] as unknown[]) : [];
    out[region.id] = [];
    for (const item of list.slice(0, MAX_BLOCKS_PER_REGION)) {
      const block = normalizeBlock(item, template, region.id);
      if (!block) continue;
      if (seen.has(block.id)) block.id = newBlockId();
      seen.add(block.id);
      out[region.id]!.push(block);
    }
  }
  return out;
}

/** Every template's layout from what's stored, with the defaults for templates never edited. */
export function normalizeLayouts(raw: unknown): HomeLayouts {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as HomeLayouts;
  for (const t of BLOCK_TEMPLATES) out[t] = src[t] ? normalizeTemplateLayout(t, src[t]) : DEFAULT_LAYOUTS[t];
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
