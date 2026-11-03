/**
 * Live chat: room names, the messages the price service relays, the posting
 * rules, and the scam and spam filter. The filter is pure so it can be unit
 * tested; the web app runs it before a message is stored.
 */

/** Redis pub/sub channel carrying ChatEvent JSON from the web app to the gateway. */
export const CHAT_CHANNEL = "chat";

export const GLOBAL_ROOM = "global";

/** Room for one asset's page, e.g. "coin:bitcoin". */
export function coinRoom(assetId: string): string {
  return `coin:${assetId}`;
}

/** Room for a community with no listed asset (hubs and m/ tokens). Asset communities use the asset's room. */
export function communityRoom(communityId: string | number): string {
  return `c:${communityId}`;
}

export type ParsedRoom = { kind: "global" } | { kind: "coin"; assetId: string } | { kind: "community"; communityId: string };

export function parseRoom(room: string): ParsedRoom | null {
  if (room === GLOBAL_ROOM) return { kind: "global" };
  const m = /^coin:([a-z0-9-]{1,100})$/.exec(room);
  if (m) return { kind: "coin", assetId: m[1]! };
  const c = /^c:(\d{1,18})$/.exec(room);
  return c ? { kind: "community", communityId: c[1]! } : null;
}

/** Most rooms one browser connection may follow at once. */
export const MAX_ROOMS_PER_CONNECTION = 4;
export const CHAT_MAX_LENGTH = 500;
/** Messages loaded when a room opens, and per "load earlier" page. */
export const CHAT_PAGE_SIZE = 50;

/** Posting limits from the plan. Moderators and admins skip the age rules. */
export const CHAT_LIMITS = {
  /** New accounts can read but not post for this long. */
  readOnlyMs: 10 * 60_000,
  /** Accounts younger than this can't post links. */
  noLinksMs: 24 * 3600_000,
  /** Minimum gap between two messages from one person. */
  minGapMs: 3_000,
  /** Messages per person per hour, across all rooms. */
  perHour: 200,
  /** Distinct reports that hide a message until a moderator looks at it. */
  reportsToHide: 3,
};

export type ChatBadge = "mod" | "admin" | "bot" | null;
export type ChatRole = "user" | "moderator" | "admin";

export interface ChatMessage {
  /** bigint id as a string; higher is newer. */
  id: string;
  room: string;
  userId: string;
  name: string;
  badge: ChatBadge;
  body: string;
  /** ms since epoch */
  at: number;
  /** Only on the author's own copy: waiting for a moderator. */
  held?: boolean;
}

/** What the web app publishes on CHAT_CHANNEL; the gateway forwards it to the room. */
export type ChatEvent =
  | { type: "chat"; room: string; msg: ChatMessage }
  | { type: "chat-remove"; room: string; ids: string[] };

export function badgeFor(role: ChatRole, isBot = false): ChatBadge {
  if (isBot) return "bot";
  return role === "admin" ? "admin" : role === "moderator" ? "mod" : null;
}

export const REPORT_REASONS = {
  scam: "Scam or phishing",
  spam: "Spam or pump",
  abuse: "Abuse or harassment",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

// ---------------------------------------------------------------------------
// Chat names

export const CHAT_NAME_RULE = "3 to 20 letters, numbers or underscores";
const CHAT_NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/**
 * Collapses characters scammers swap to look like someone else: case,
 * digits that pass for letters, "rn" for "m", underscores. Two names with the
 * same skeleton look the same in chat.
 */
export function nameSkeleton(name: string): string {
  return name
    .toLowerCase()
    .replace(/_/g, "")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[0-9]/g, (d) => "olzeastbbg"[Number(d)]!)
    .replace(/i/g, "l");
}

/** Skeleton fragments no ordinary member's name may contain. */
const RESERVED_PARTS = ["admln", "moderator", "mldblg", "support", "offlclal", "helpdesk", "coingecko", "staff"].map(
  nameSkeleton,
);
/** Whole words (split on underscores and digits) that are reserved on their own. */
const RESERVED_WORDS = new Set(["mod", "mods", "team", "help", "owner", "root", "system"]);

/**
 * Why a chat name can't be used, or null when it's fine. Staff names are the
 * current moderators' and admins' names; anyone else whose name looks like
 * one of them is refused.
 */
export function chatNameProblem(name: string, staffNames: string[], isStaff = false): string | null {
  if (!CHAT_NAME_RE.test(name)) return `Use ${CHAT_NAME_RULE}.`;
  if (isStaff) return null;
  const sk = nameSkeleton(name);
  const words = name.toLowerCase().split(/[_0-9]+/).filter(Boolean);
  if (RESERVED_PARTS.some((p) => sk.includes(p)) || words.some((w) => RESERVED_WORDS.has(w))) {
    return "That name looks like a staff account. Please pick another.";
  }
  if (/bot$/i.test(name.replace(/[_0-9]+$/, ""))) return "Names ending in \"bot\" are kept for midbig's bots. Please pick another.";
  if (staffNames.some((s) => nameSkeleton(s) === sk && s.toLowerCase() !== name.toLowerCase())) {
    return "That name looks too much like a moderator's. Please pick another.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Message filter

/** Strips invisible and control characters and tidies whitespace before a message is stored. */
export function cleanBody(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type FilterReason =
  | "wallet-address"
  | "messaging-invite"
  | "phone-number"
  | "dm-request"
  | "guaranteed-returns"
  | "wallet-secrets"
  | "giveaway"
  | "staff-impersonation"
  | "pump-spam"
  | "link-shortener"
  | "lookalike-domain"
  | "unknown-link";

/** Shown in the moderation queue next to a held message. */
export const FILTER_REASON_LABELS: Record<FilterReason, string> = {
  "wallet-address": "Wallet address",
  "messaging-invite": "Telegram, WhatsApp or similar invite",
  "phone-number": "Phone number",
  "dm-request": "Asks people to DM",
  "guaranteed-returns": "Promises returns",
  "wallet-secrets": "Mentions seed phrase or private key",
  giveaway: "Giveaway or airdrop claim",
  "staff-impersonation": "Claims to be staff",
  "pump-spam": "Pump spam",
  "link-shortener": "Link shortener",
  "lookalike-domain": "Lookalike of a known site",
  "unknown-link": "Link to a site not on the allow list",
};

export type FilterResult =
  | { action: "allow" }
  /** Stored but hidden until a moderator approves it. */
  | { action: "hold"; reasons: FilterReason[] }
  /** Not stored; the message tells the author what to change. */
  | { action: "reject"; message: string };

export interface FilterContext {
  /** False for accounts younger than CHAT_LIMITS.noLinksMs. */
  canPostLinks: boolean;
  /** Moderators and admins: skips the impersonation and link checks. */
  isStaff?: boolean;
  /** Members with a good track record: links to sites off the allow list aren't held. */
  trustedLinks?: boolean;
  /** Longest body allowed; chat's limit unless given (forum posts are longer). */
  maxLength?: number;
}

/** Links to these sites (and their subdomains) are posted straight away. */
const ALLOWED_DOMAINS = [
  "midbig.com",
  "coingecko.com",
  "coinbase.com",
  "kraken.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "github.com",
  "wikipedia.org",
  "tradingview.com",
  "bloomberg.com",
  "reuters.com",
  "cnbc.com",
  "wsj.com",
  "ft.com",
  "coindesk.com",
  "cointelegraph.com",
  "theblock.co",
  "decrypt.co",
  "sec.gov",
  "federalreserve.gov",
  "etherscan.io",
  "blockchain.com",
  "mempool.space",
  "bitcoin.org",
  "ethereum.org",
];

const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "is.gd",
  "cutt.ly",
  "rb.gy",
  "shorturl.at",
  "ow.ly",
  "tiny.cc",
  "rebrand.ly",
  "s.id",
  "linktr.ee",
];

/** Brands scam domains copy ("coinbase-wallet-verify.xyz"). */
const BRANDS = [
  "coinbase",
  "kraken",
  "binance",
  "metamask",
  "trustwallet",
  "ledger",
  "trezor",
  "uniswap",
  "pancakeswap",
  "opensea",
  "phantom",
  "midbig",
  "coingecko",
  "blockchain",
  "etherscan",
];

const MESSAGING_DOMAINS = [
  "t.me",
  "telegram.me",
  "telegram.dog",
  "wa.me",
  "chat.whatsapp.com",
  "whatsapp.com",
  "discord.gg",
  "discord.com",
  "signal.me",
  "signal.group",
  "line.me",
];

const TLDS =
  "com|net|org|io|co|me|gg|ly|xyz|app|finance|top|site|online|live|info|pro|club|vip|cc|biz|ws|tk|ml|ga|cf|gq|link|click|shop|store|fun|exchange|money|cash|trade|market|network|space|tech|dev|ai|us|uk|ru|cn|at|id|to";
const URL_RE = new RegExp(
  String.raw`(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:${TLDS}))(?![a-z0-9-])(?:[\/?#][^\s]*)?`,
  "gi",
);

/** Domains in a message, also catching "t . me" and "site dot com" spellings. */
export function findDomains(text: string): string[] {
  const squeezed = text
    .toLowerCase()
    .replace(/\s*(?:\(|\[)?\s*dot\s*(?:\)|\])?\s*/g, ".")
    .replace(/\s*\.\s*/g, ".");
  const out = new Set<string>();
  for (const src of [text.toLowerCase(), squeezed]) {
    for (const m of src.matchAll(URL_RE)) {
      const host = m[1]!.replace(/^www\./, "");
      // "e.g." and "u.s." style abbreviations aren't links.
      const short = host.split(".").slice(0, -1).every((p) => p.length <= 1);
      if (short && !MESSAGING_DOMAINS.includes(host) && !SHORTENERS.includes(host)) continue;
      out.add(host);
    }
  }
  return [...out];
}

function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

const BASE58 = "1-9A-HJ-NP-Za-km-z";
const WALLET_RES = [
  /\b0x[a-fA-F0-9]{40}\b/, // Ethereum and other EVM chains
  /\b(?:bc1|ltc1|tb1)[a-z0-9]{25,90}\b/i, // bech32 Bitcoin and Litecoin
  new RegExp(String.raw`\b[13][${BASE58}]{25,34}\b`), // legacy Bitcoin
  new RegExp(String.raw`\bT[${BASE58}]{33}\b`), // Tron
];
/** Solana and similar: long base58 runs with mixed case and digits (ordinary words never are). */
const LONG_BASE58_RE = new RegExp(String.raw`\b[${BASE58}]{32,44}\b`, "g");

function hasWallet(text: string): boolean {
  if (WALLET_RES.some((re) => re.test(text))) return true;
  for (const m of text.matchAll(LONG_BASE58_RE)) {
    const s = m[0];
    if (/[0-9]/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s)) return true;
  }
  return false;
}

/** Lowercase words for phrase checks. With `leet`, digit and symbol swaps ("fr33", "$end") are undone too. */
function plain(text: string, leet: boolean): string {
  let t = text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  if (leet) t = t.replace(/[0@4$531]/g, (c) => ({ "0": "o", "@": "a", "4": "a", $: "s", "5": "s", "3": "e", "1": "i" })[c]!);
  return t.replace(/[^a-z0-9\s%+@:]/g, " ").replace(/\s+/g, " ");
}

const PHRASES: [FilterReason, RegExp][] = [
  ["messaging-invite", /\b(telegram|whats ?app|signal|wechat|discord|tg|kik|snapchat)\b.{0,25}(@|\+ ?\d|\bjoin\b|\badd\b|\bgroup\b|\bchannel\b)/],
  ["messaging-invite", /\b(join|contact|message|add|text|reach|find|dm)( me| us| our)?( on| via| at| in)( my| our)? (telegram|whats ?app|signal|wechat|discord|tg|kik)\b/],
  ["dm-request", /\b(dm|pm|inbox|msg|message|text|contact|ping|hmu)( me| us)\b/],
  ["dm-request", /\b(send|drop) (me|us) an? (dm|pm|message)\b|\bslide (in|into) (my|the) dms?\b|\bcheck (your|ur|my) (dm|dms|inbox)\b|\b(dm|pm) (for|to get|to join)\b/],
  ["guaranteed-returns", /\bguarante+d?s?\b.{0,30}\b(profits?|returns?|gains?|income|roi|payouts?|x)\b/],
  ["guaranteed-returns", /\b(risk free|no risk|zero risk|100 ?% (safe|sure|profit|guaranteed))\b/],
  ["guaranteed-returns", /\bdouble your (money|crypto|coins?|btc|eth|investment|funds|portfolio)\b/],
  ["guaranteed-returns", /\b\d* ?% (daily|weekly|a day|a week|per day|per week) (profit|returns?|roi|income|gains?)\b/],
  ["guaranteed-returns", /\b(account manager|investment (plan|platform|manager|expert|mentor)|trading mentor|signals? group|recover (your )?(lost|stolen|scammed) (funds|crypto|money|coins))\b/],
  ["wallet-secrets", /\b(seed|recovery|secret|mnemonic|backup) (phrase|words?|key)\b|\bprivate keys?\b|\b(12|twelve|24|twenty four) words?\b/],
  ["wallet-secrets", /\b(validate|verify|sync|synchroni[sz]e|rectify|connect) (your |ur )?wallets?\b/],
  ["giveaway", /\bgive ?aways?\b|\bfree (btc|eth|bitcoin|crypto|usdt|usdc|sol|tokens?|coins?|airdrop|money)\b|\bclaim (your |ur )?(free )?(airdrop|reward|tokens?|bonus|prize)\b/],
  ["staff-impersonation", /\b(i ?a?m|im|this is|we are|official)( an?| the)? (midbig )?(admin|administrator|moderator|mod|support|staff)\b|\bmidbig (support|team|admin|staff|official)\b/],
];

const PUMP_RE = [
  /\b\d{3,} ?x\b|\b(next|easy|quick) \d+ ?x\b/,
  /\b(buy|ape|load up|get in) (now|before|asap|quick|fast)\b/,
  /\b(pre ?sale|stealth launch|fair launch|presale|whitelist spots?)\b/,
  /\b(to the moon|mooning|going parabolic|send it)\b/,
  /\bcontract address\b|\bca ?:/,
];

const HYPE_EMOJI_RE = /🚀|🌕|🌙|💎|🔥|💰|🤑|📈|💸/gu;

/**
 * Checks a cleaned message. Rejections are things the author can fix (a link
 * from a new account, shouting); holds are what scammers post, kept back for
 * a moderator instead of shown.
 */
export function checkMessage(body: string, ctx: FilterContext): FilterResult {
  if (body.length === 0) return { action: "reject", message: "Type a message first." };
  const max = ctx.maxLength ?? CHAT_MAX_LENGTH;
  if (body.length > max) {
    return { action: "reject", message: `Keep it under ${max.toLocaleString("en-US")} characters.` };
  }
  if (/(.)\1{14,}/su.test(body) || /\b(\w+)\b(?:\W+\1\b){7,}/i.test(body)) {
    return { action: "reject", message: "That looks like spam. Please write a normal message." };
  }
  const letters = body.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.75) {
    return { action: "reject", message: "Please don't post in all caps." };
  }

  const reasons = new Set<FilterReason>();
  const texts = [plain(body, false), plain(body, true)];
  const domains = findDomains(body);

  if (hasWallet(body)) reasons.add("wallet-address");
  if (/\+ ?\d[\d\s().-]{8,}\d/.test(body)) reasons.add("phone-number");
  for (const [reason, re] of PHRASES) {
    if (reason === "staff-impersonation" && ctx.isStaff) continue;
    if (texts.some((t) => re.test(t))) reasons.add(reason);
  }

  // Pump spam: two hype signals together, or a wall of rocket emojis.
  const emoji = body.match(HYPE_EMOJI_RE)?.length ?? 0;
  const pumpHits = PUMP_RE.filter((re) => texts.some((t) => re.test(t))).length + (emoji >= 3 ? 1 : 0);
  if (pumpHits >= 2 || emoji >= 8) reasons.add("pump-spam");

  // Scam-shaped links are held whoever posts them; any other link from a new
  // account is refused, and unknown sites wait for a moderator.
  let plainLink = false;
  for (const host of domains) {
    if (MESSAGING_DOMAINS.some((d) => onDomain(host, d))) reasons.add("messaging-invite");
    else if (SHORTENERS.some((d) => onDomain(host, d))) reasons.add("link-shortener");
    else if (ALLOWED_DOMAINS.some((d) => onDomain(host, d))) plainLink = true;
    else if (BRANDS.some((b) => host.replace(/[^a-z0-9]/g, "").includes(b))) reasons.add("lookalike-domain");
    else if (ctx.isStaff || ctx.trustedLinks) plainLink = true;
    else {
      plainLink = true;
      if (ctx.canPostLinks) reasons.add("unknown-link");
    }
  }
  if (plainLink && !ctx.canPostLinks && !ctx.isStaff && reasons.size === 0) {
    return { action: "reject", message: "New accounts can post links after their first 24 hours." };
  }

  return reasons.size > 0 ? { action: "hold", reasons: [...reasons] } : { action: "allow" };
}
