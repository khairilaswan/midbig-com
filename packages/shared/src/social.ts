/**
 * Phase 7 social rules: photos, post flair, reactions, polls, follows,
 * notifications, badges and the light text formatting posts allow.
 */

// ---------------------------------------------------------------------------
// Photos

export const MEDIA_LIMITS = {
  /** Largest upload accepted, after the browser shrinks it. */
  maxBytes: 2 * 1024 * 1024,
  /** Longest side the browser shrinks post photos to. */
  postMaxSide: 1600,
  avatarSide: 256,
  bannerWidth: 1500,
  bannerHeight: 500,
  /** Photos on one post or comment. */
  perPost: 4,
  /** Uploads per member per day, all kinds. */
  perDay: 40,
  /** Accounts younger than this can't add photos to posts (like links). */
  noPhotosMs: 24 * 3600_000,
};

export type MediaKind = "post" | "avatar" | "banner";
export type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function isMediaKind(s: unknown): s is MediaKind {
  return s === "post" || s === "avatar" || s === "banner";
}

/**
 * The image type from a file's first bytes, or null when it isn't a JPEG,
 * PNG, WebP or GIF. The declared type is never trusted (SVG and HTML are refused).
 */
export function sniffImage(b: Uint8Array): MediaType | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

export const MEDIA_EXT: Record<MediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Public URL of a stored photo. The id is random, so URLs can't be guessed. */
export function mediaUrl(id: string, type: MediaType): string {
  return `/media/${id}.${MEDIA_EXT[type]}`;
}

/** A media id as the URL and forms carry it: 22 URL-safe characters. */
export function isMediaId(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{22}$/.test(s);
}

// ---------------------------------------------------------------------------
// Flair

export const FLAIRS = {
  analysis: { label: "Analysis", emoji: "📊" },
  news: { label: "News", emoji: "📰" },
  question: { label: "Question", emoji: "❓" },
  discussion: { label: "Discussion", emoji: "💬" },
  chart: { label: "Chart", emoji: "📈" },
  earnings: { label: "Earnings", emoji: "💵" },
  meme: { label: "Meme", emoji: "😂" },
  gain: { label: "Gain", emoji: "🟢" },
  loss: { label: "Loss", emoji: "🔴" },
} as const;

export type Flair = keyof typeof FLAIRS;

export function isFlair(s: unknown): s is Flair {
  return typeof s === "string" && Object.hasOwn(FLAIRS, s);
}

// ---------------------------------------------------------------------------
// Reactions

export const REACTIONS = {
  rocket: "🚀",
  fire: "🔥",
  laugh: "😂",
  eyes: "👀",
  diamond: "💎",
  bear: "🐻",
} as const;

export type Reaction = keyof typeof REACTIONS;

export function isReaction(s: unknown): s is Reaction {
  return typeof s === "string" && Object.hasOwn(REACTIONS, s);
}

// ---------------------------------------------------------------------------
// Polls

export const POLL_LIMITS = {
  minOptions: 2,
  maxOptions: 6,
  optionMax: 60,
  /** How long a poll can run. */
  minHours: 1,
  maxHours: 14 * 24,
  defaultHours: 72,
};

/** Cleans poll options: trimmed, no blanks or repeats. Returns why they won't do, or the list. */
export function checkPoll(rawOptions: unknown, rawHours: unknown): { options: string[]; hours: number } | { error: string } {
  if (!Array.isArray(rawOptions)) return { error: "Add at least two poll options." };
  const seen = new Set<string>();
  const options: string[] = [];
  for (const o of rawOptions) {
    const t = String(o ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (t.length > POLL_LIMITS.optionMax) return { error: `Keep each option under ${POLL_LIMITS.optionMax} characters.` };
    if (seen.has(t.toLowerCase())) return { error: "Each poll option needs to be different." };
    seen.add(t.toLowerCase());
    options.push(t);
  }
  if (options.length < POLL_LIMITS.minOptions) return { error: "Add at least two poll options." };
  if (options.length > POLL_LIMITS.maxOptions) return { error: `A poll can have up to ${POLL_LIMITS.maxOptions} options.` };
  const h = Math.round(Number(rawHours ?? POLL_LIMITS.defaultHours));
  if (!Number.isFinite(h) || h < POLL_LIMITS.minHours || h > POLL_LIMITS.maxHours) {
    return { error: "Polls run from 1 hour to 14 days." };
  }
  return { options, hours: h };
}

/** Each option's share of the votes, rounded so the shown figures add up to 100. */
export function pollShares(counts: number[]): number[] {
  const total = counts.reduce((s, n) => s + n, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((s, n) => s + n, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Notifications

export type NotificationKind = "reply" | "mention" | "follow" | "milestone";

/** Upvote totals on one post that earn its author a notification. */
export const VOTE_MILESTONES = [10, 50, 100, 500, 1000];

/** The milestone a post just passed going from one score to the next, if any. */
export function milestonePassed(before: number, after: number): number | null {
  if (after <= before) return null;
  for (const m of VOTE_MILESTONES) if (before < m && after >= m) return m;
  return null;
}

// ---------------------------------------------------------------------------
// Badges

export interface BadgeInput {
  createdAt: number;
  topics: number;
  replies: number;
  scoreReceived: number;
  followers: number;
  verified: boolean;
  /** Member number by sign-up order (1 = first). */
  memberNo: number;
  /** Polls the member started. */
  polls: number;
}

export interface Badge {
  id: string;
  emoji: string;
  label: string;
  hint: string;
}

/** Badges a profile shows, earned from activity. Computed, not stored, so rules can change. */
export function badgesFor(m: BadgeInput, now = Date.now()): Badge[] {
  const out: Badge[] = [];
  const add = (id: string, emoji: string, label: string, hint: string) => out.push({ id, emoji, label, hint });
  if (m.memberNo > 0 && m.memberNo <= 1000) add("early", "🌱", "Early member", "One of the first 1,000 members.");
  if (m.verified) add("verified", "✅", "Verified", "Checked by the midbig team.");
  if (m.topics >= 1) add("first-post", "✍️", "First post", "Started a topic.");
  if (m.topics >= 25) add("storyteller", "📚", "Storyteller", "Started 25 topics.");
  if (m.replies >= 100) add("talker", "💬", "Conversationalist", "Wrote 100 comments.");
  if (m.scoreReceived >= 100) add("useful", "⭐", "Useful", "100 net upvotes from others.");
  if (m.scoreReceived >= 1000) add("legend", "🏆", "Community legend", "1,000 net upvotes from others.");
  if (m.followers >= 10) add("followed", "👥", "Followed", "10 followers.");
  if (m.followers >= 100) add("influencer", "📣", "Influencer", "100 followers.");
  if (m.polls >= 1) add("pollster", "🗳️", "Pollster", "Ran a poll.");
  if (now - m.createdAt >= 365 * 24 * 3600_000) add("veteran", "🎖️", "One year", "A member for a year.");
  return out;
}

// ---------------------------------------------------------------------------
// Text formatting: **bold**, *italic*, `code`, ~~strike~~, ||spoiler|| and "> " quotes.

export type Inline =
  | { kind: "plain"; text: string }
  | { kind: "bold" | "italic" | "code" | "strike" | "spoiler"; text: string };

/**
 * Splits a line into plain runs and formatted runs. Formatting doesn't nest
 * and needs text inside, so "2 * 3 * 4" and "**" stay as written.
 */
export function splitInline(text: string): Inline[] {
  const re = /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|~~([^~\n]+?)~~|\|\|([^|\n]+?)\|\||(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g;
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: "plain", text: text.slice(last, m.index) });
    if (m[1] != null) out.push({ kind: "code", text: m[1] });
    else if (m[2] != null) out.push({ kind: "bold", text: m[2] });
    else if (m[3] != null) out.push({ kind: "strike", text: m[3] });
    else if (m[4] != null) out.push({ kind: "spoiler", text: m[4] });
    else out.push({ kind: "italic", text: m[5]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "plain", text: text.slice(last) });
  return out;
}

export type Block = { kind: "para"; text: string } | { kind: "quote"; text: string };

/** Paragraphs on blank lines; a run of lines starting with ">" is a quote. */
export function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    let buf: string[] = [];
    let quoting: boolean | null = null;
    const flush = () => {
      if (buf.length) out.push({ kind: quoting ? "quote" : "para", text: buf.join("\n") });
      buf = [];
    };
    for (const line of chunk.split("\n")) {
      const q = /^\s*>\s?/.test(line);
      if (quoting !== null && q !== quoting) flush();
      quoting = q;
      buf.push(q ? line.replace(/^\s*>\s?/, "") : line);
    }
    flush();
  }
  return out.filter((b) => b.text.trim() !== "" || b.kind === "quote");
}

/**
 * The text without its "> " quoted lines, so quoting a comment doesn't
 * notify the people it mentioned or call the bots it asked again.
 */
export function withoutQuotes(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .trim();
}

/**
 * A quote of someone's comment to start a reply with. Bots are named without
 * the @, so quoting one doesn't call it again.
 */
export function quoteFor(name: string, body: string, mention = true, max = 300): string {
  const text = body.length > max ? `${body.slice(0, max).trimEnd()}…` : body;
  return `${text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}\n> — ${mention ? "@" : ""}${name}\n\n`;
}
