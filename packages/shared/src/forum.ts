/**
 * Forum and reputation rules: limits, reputation levels and topic URLs.
 * Topics live in communities (community.ts). Posts go through the same scam
 * filter as chat (checkMessage).
 */

export const FORUM_LIMITS = {
  titleMin: 8,
  titleMax: 120,
  topicMax: 10_000,
  replyMax: 5_000,
  /** Members can fix their own posts for this long after posting. */
  editMs: 60 * 60_000,
  /** Minimum gap between two topics, and between two replies, from one person. */
  topicGapMs: 2 * 60_000,
  replyGapMs: 15_000,
  topicsPerDay: 10,
  repliesPerDay: 100,
  /** Topics per page. */
  pageSize: 30,
  /** Comments loaded with a topic. */
  commentsMax: 500,
  /** Distinct reports that hide a post until a moderator looks. */
  reportsToHide: 3,
  bioMax: 160,
};

// ---------------------------------------------------------------------------
// Reputation

/** Points for each upvote a post gets (a downvote takes one away), and lost for each post moderators remove. */
export const REP_POINTS = { vote: 1, removed: -10 };

/**
 * Levels earned from reputation. Trusted members' links to sites off the
 * allow list post straight away, and their reports count double.
 */
export const REP_LEVELS = [
  { min: 0, name: "Newcomer" },
  { min: 10, name: "Member" },
  { min: 50, name: "Trusted" },
  { min: 250, name: "Veteran" },
] as const;
export type RepLevel = (typeof REP_LEVELS)[number]["name"];

/** Trusted also needs an account at least this old, so a vote ring can't mint one overnight. */
export const TRUSTED_MIN_AGE_MS = 30 * 24 * 3600_000;
export const TRUSTED_MIN_REP = 50;

export function repLevel(rep: number): RepLevel {
  let level: RepLevel = REP_LEVELS[0].name;
  for (const l of REP_LEVELS) if (rep >= l.min) level = l.name;
  return level;
}

export function isTrusted(rep: number, createdAt: number, now = Date.now()): boolean {
  return rep >= TRUSTED_MIN_REP && now - createdAt >= TRUSTED_MIN_AGE_MS;
}

/** The next level and how many points it needs, or null at the top. */
export function nextLevel(rep: number): { name: RepLevel; needs: number } | null {
  const next = REP_LEVELS.find((l) => l.min > rep);
  return next ? { name: next.name, needs: next.min - rep } : null;
}

/**
 * Reputation from what a member's posts earned: other people's upvotes minus
 * their downvotes, minus a penalty for each post moderators removed. Never
 * below zero.
 */
export function reputation(netVotes: number, removedPosts: number): number {
  return Math.max(0, netVotes * REP_POINTS.vote + removedPosts * REP_POINTS.removed);
}

// ---------------------------------------------------------------------------
// Titles and URLs

/** "Is BTC topping out?" -> "is-btc-topping-out" */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "topic"
  );
}

export function topicPath(id: string | number, title: string): string {
  return `/forum/t/${id}/${slugify(title)}`;
}

export function profilePath(name: string): string {
  return `/u/${encodeURIComponent(name)}`;
}

/** Tidies a title: one line, single spaces. Null with the problem when it can't be used. */
export function checkTitle(raw: string): { title: string } | { error: string } {
  const title = raw.replace(/\s+/g, " ").trim();
  if (title.length < FORUM_LIMITS.titleMin) return { error: `Make the title at least ${FORUM_LIMITS.titleMin} characters.` };
  if (title.length > FORUM_LIMITS.titleMax) return { error: `Keep the title under ${FORUM_LIMITS.titleMax} characters.` };
  const letters = title.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 12 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.75) {
    return { error: "Please don't write the title in all caps." };
  }
  return { title };
}
