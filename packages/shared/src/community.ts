/**
 * Communities: the b/ and m/ namespaces, community names, votes and the
 * "hot" rank, comment trees, $TICKER and @name mentions, and the sentiment
 * gauge. Pure, so the rules can be unit tested and shared with the browser.
 */

import { assetClassOf, type AssetClass } from "./markets.js";

/**
 * b/ holds the main assets and topic hubs, set up by admins. m/ holds
 * smaller coins and member-made communities, which only verified members
 * can create.
 */
export type Namespace = "b" | "m";
export type CommunityKind = "asset" | "hub" | "token";

export const NAMESPACES: Record<Namespace, { name: string; blurb: string }> = {
  b: { name: "Big", blurb: "Main coins, stocks and forex pairs, plus the topic hubs. Set up by midbig." },
  m: { name: "Mid", blurb: "Smaller coins and communities made by verified members. Extra care: do your own research." },
};

export function isNamespace(s: string): s is Namespace {
  return s === "b" || s === "m";
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;

/** Words no community may be called, so URLs and staff names stay unambiguous. */
const RESERVED_SLUGS = new Set([
  "admin",
  "administrator",
  "mod",
  "mods",
  "moderator",
  "support",
  "help",
  "official",
  "staff",
  "team",
  "new",
  "all",
  "popular",
  "home",
  "feed",
  "search",
  "settings",
  "api",
  "www",
  "null",
  "undefined",
]);

/**
 * The name a listed asset's community gets by default: the CoinGecko id for
 * crypto (bitcoin), the ticker for stocks (aapl, shown as AAPL) and the pair
 * for forex (eurusd).
 */
export function defaultSlug(assetId: string): string {
  const cls = assetClassOf(assetId);
  if (cls === "stock") return assetId.slice("stock-".length).replace(/-/g, "");
  if (cls === "forex") return assetId.slice("fx-".length).replace(/-/g, "");
  return assetId;
}

/** Tidies what someone typed ("m/Pepe Coin" -> "pepe-coin"). */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(mb|[bm])\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Why a community can't use this name, or null when it's fine. `taken` holds
 * every name already used plus the default names of listed assets, which stay
 * reserved for their b/ community even before an admin creates it.
 */
export function slugProblem(slug: string, taken: Set<string>): string | null {
  if (!SLUG_RE.test(slug)) return "Use 2 to 50 lower-case letters, numbers or dashes, starting with a letter or number.";
  if (RESERVED_SLUGS.has(slug) || slug.includes("midbig")) return "That name is reserved.";
  if (taken.has(slug)) return "That name is taken or reserved for a listed asset.";
  return null;
}

/**
 * How a community name is shown: stock tickers in capitals (b/AAPL), the
 * rest as stored (b/bitcoin, b/eurusd, m/pepe).
 */
export function communityLabel(c: { ns: Namespace; slug: string; assetClass: AssetClass | null; kind: CommunityKind }): string {
  return `${c.ns}/${c.kind === "asset" && c.assetClass === "stock" ? c.slug.toUpperCase() : c.slug}`;
}

export function communityPath(c: { ns: Namespace; slug: string; assetClass: AssetClass | null; kind: CommunityKind }): string {
  return `/${communityLabel(c)}`;
}

/** Limits on making and running m/ communities. */
export const COMMUNITY_LIMITS = {
  /** m/ communities one verified member may create. */
  perMember: 3,
  titleMax: 80,
  descriptionMax: 500,
  rulesMax: 2000,
  symbolMax: 20,
};

// ---------------------------------------------------------------------------
// Votes and ranking

export type VoteValue = -1 | 0 | 1;

/** A post at or below this score is folded away, so scams and shills sink on their own. */
export const COLLAPSE_SCORE = -4;

export const VOTE_LIMITS = {
  /** Accounts vote after their first day, so a fresh batch of sign-ups can't swing a post. */
  minAgeMs: 24 * 3600_000,
  /** Downvotes need an account at least this old. */
  downMinAgeMs: 3 * 24 * 3600_000,
  perHour: 100,
};

/** 2026-01-01 UTC in seconds. Must match the migration that first filled forum_topics.hot. */
const HOT_EPOCH_S = 1767225600;

/**
 * The "hot" rank: net votes count on a log scale (the first 10 votes weigh
 * as much as the next 90), and every 12.5 hours of age costs as much as a
 * tenfold change in votes. Bigger is hotter.
 */
export function hotRank(score: number, createdAtMs: number): number {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  return Math.sign(score) * order + (createdAtMs / 1000 - HOT_EPOCH_S) / 45000;
}

export type TopicSort = "hot" | "new" | "top";
export type TopWindow = "day" | "week" | "month" | "year" | "all";

export const TOP_WINDOWS: Record<TopWindow, { label: string; days: number | null }> = {
  day: { label: "Today", days: 1 },
  week: { label: "This week", days: 7 },
  month: { label: "This month", days: 30 },
  year: { label: "This year", days: 365 },
  all: { label: "All time", days: null },
};

export function parseSort(s: string | undefined): TopicSort {
  return s === "new" || s === "top" ? s : "hot";
}

export function parseWindow(s: string | undefined): TopWindow {
  return s && Object.hasOwn(TOP_WINDOWS, s) ? (s as TopWindow) : "week";
}

/**
 * What one vote change does to a post's counts: from the voter's previous
 * vote to their new one (0 = no vote).
 */
export function voteDelta(prev: VoteValue, next: VoteValue): { ups: number; downs: number; score: number } {
  const ups = (next === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
  const downs = (next === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
  return { ups, downs, score: ups - downs };
}

/** Why this account can't cast this vote, or null when it can. */
export function voteProblem(v: { createdAt: number; isStaff: boolean }, value: VoteValue, now = Date.now()): string | null {
  if (v.isStaff || value === 0) return null;
  if (now - v.createdAt < VOTE_LIMITS.minAgeMs) return "New accounts can vote after their first day.";
  if (value === -1 && now - v.createdAt < VOTE_LIMITS.downMinAgeMs) return "Downvotes open up after your first three days.";
  return null;
}

// ---------------------------------------------------------------------------
// Comment trees

/** Replies nest this deep; answers to the deepest level attach beside it. */
export const MAX_DEPTH = 6;

export interface TreeItem {
  id: string;
  parentId: string | null;
  score: number;
  createdAt: number;
}

export type CommentSort = "best" | "new" | "old";

export function parseCommentSort(s: string | undefined): CommentSort {
  return s === "new" || s === "old" ? s : "best";
}

/**
 * Builds the reply tree. Siblings sort by score ("best"), newest or oldest
 * first. A comment whose parent isn't in the list (removed, or on another
 * page) is shown at the top level so it isn't lost.
 */
export function buildTree<T extends TreeItem>(items: T[], sort: CommentSort = "best"): (T & { children: (T & { children: unknown[] })[] })[] {
  type Node = T & { children: Node[] };
  const nodes = new Map<string, Node>(items.map((i) => [i.id, { ...i, children: [] }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const cmp = (a: Node, b: Node) =>
    sort === "new"
      ? b.createdAt - a.createdAt
      : sort === "old"
        ? a.createdAt - b.createdAt
        : b.score - a.score || a.createdAt - b.createdAt;
  const sortAll = (list: Node[]) => {
    list.sort(cmp);
    for (const n of list) sortAll(n.children);
  };
  sortAll(roots);
  return roots as never;
}

// ---------------------------------------------------------------------------
// Mentions

export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "link"; url: string }
  | { kind: "ticker"; symbol: string; text: string }
  | { kind: "user"; name: string; text: string };

/**
 * Splits member text into plain text, links, $TICKER tags and @name
 * mentions. A ticker starts with a letter, so "$100" stays a price.
 */
export function splitMentions(text: string): TextPart[] {
  const re = /(https?:\/\/[^\s<>"]+)|(?<![\w$])\$([A-Za-z][A-Za-z0-9.]{0,9})(?![\w])|(?<![\w@])@([A-Za-z0-9_]{3,20})(?!\w)/g;
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    let token = m[0];
    // "$BRK.B." ends a sentence: the final dot isn't part of the ticker.
    let symbol = m[2];
    if (symbol?.endsWith(".")) {
      symbol = symbol.replace(/\.+$/, "");
      token = `$${symbol}`;
    }
    if (m.index! > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: "link", url: m[1] });
    else if (symbol) out.push({ kind: "ticker", symbol: symbol.toUpperCase(), text: token });
    else out.push({ kind: "user", name: m[3]!, text: token });
    last = m.index! + token.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The distinct $TICKERs and @names in a text, in order of first use. */
export function findMentions(text: string): { tickers: string[]; users: string[] } {
  const tickers = new Set<string>();
  const users = new Map<string, string>();
  for (const p of splitMentions(text)) {
    if (p.kind === "ticker") tickers.add(p.symbol);
    else if (p.kind === "user" && !users.has(p.name.toLowerCase())) users.set(p.name.toLowerCase(), p.name);
  }
  return { tickers: [...tickers], users: [...users.values()] };
}

/** Where a $TICKER tag leads: a redirect that picks the community or asset page. */
export function tickerPath(symbol: string): string {
  return `/t/${encodeURIComponent(symbol.toUpperCase())}`;
}

// ---------------------------------------------------------------------------
// Sentiment

export type Stance = "bull" | "bear";

export function isStance(s: unknown): s is Stance {
  return s === "bull" || s === "bear";
}

/**
 * The bull share of the calls made, 0 to 100, or null with too few calls to
 * mean anything.
 */
export function bullShare(bulls: number, bears: number, minCalls = 3): number | null {
  const n = bulls + bears;
  if (n < minCalls) return null;
  return Math.round((bulls / n) * 100);
}
