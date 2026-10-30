import "server-only";
import { createHash } from "node:crypto";
import {
  badgeFor,
  CHAT_LIMITS,
  checkMessage,
  checkTitle,
  cleanBody,
  findDomains,
  FORUM_LIMITS,
  isForumCategory,
  isTrusted,
  reputation,
  topicPath,
  type ChatRole,
  type FilterReason,
  type ForumCategory,
  type ReportReason,
} from "@midbig/shared";
import { getSession, turnstile } from "./auth";
import { canModerate, getViewer, postBlock, verifyTurnstile, type Viewer } from "./chat";
import { pool, redis } from "./server";
import type { ForumAuthor, ForumMe, ForumPost, ForumQueueItem, Profile, TopicSummary } from "./types";

type Status = "visible" | "held" | "removed";

interface AuthorCols {
  user_id: string;
  chat_name: string | null;
  role: ChatRole;
  reputation: number;
}

function author(r: AuthorCols): ForumAuthor {
  return { id: r.user_id, name: r.chat_name ?? "member", badge: badgeFor(r.role), reputation: r.reputation };
}

// ---------------------------------------------------------------------------
// Reading

interface TopicRecord extends AuthorCols {
  id: string;
  title: string;
  category: ForumCategory;
  asset_id: string | null;
  asset_symbol: string | null;
  status: Status;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  helpful: number;
  last_post_at: Date;
  created_at: Date;
}

const TOPIC_SELECT = `SELECT t.id::text, t.title, t.category, t.asset_id, upper(a.symbol) AS asset_symbol, t.status, t.pinned, t.locked,
    t.reply_count, t.last_post_at, t.created_at, t.user_id, u.chat_name, u.role, u.reputation,
    COALESCE((SELECT helpful_count FROM forum_posts f WHERE f.topic_id = t.id AND f.is_first), 0) AS helpful
  FROM forum_topics t JOIN "user" u ON u.id = t.user_id LEFT JOIN assets a ON a.id = t.asset_id`;

function toTopic(r: TopicRecord): TopicSummary {
  return {
    id: r.id,
    title: r.title,
    path: topicPath(r.id, r.title),
    category: r.category,
    assetId: r.asset_id,
    assetSymbol: r.asset_symbol,
    author: author(r),
    replies: r.reply_count,
    helpful: r.helpful,
    lastPostAt: r.last_post_at.getTime(),
    createdAt: r.created_at.getTime(),
    pinned: r.pinned,
    locked: r.locked,
    status: r.status,
  };
}

/**
 * Visible topics, newest activity first (pinned first within a category), or
 * by helpful votes on the opening post over the last 30 days.
 */
export async function listTopics(opts: {
  category?: ForumCategory;
  assetId?: string;
  sort?: "latest" | "top";
  page?: number;
  limit?: number;
}): Promise<{ topics: TopicSummary[]; hasMore: boolean }> {
  const limit = opts.limit ?? FORUM_LIMITS.pageSize;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const top = opts.sort === "top";
  const res = await pool().query<TopicRecord>(
    `${TOPIC_SELECT}
     WHERE t.status = 'visible' AND ($1::text IS NULL OR t.category = $1) AND ($2::text IS NULL OR t.asset_id = $2)
       ${top ? "AND t.created_at > now() - interval '30 days'" : ""}
     ORDER BY ${top ? "helpful DESC, t.reply_count DESC," : opts.category ? "t.pinned DESC," : ""} t.last_post_at DESC
     LIMIT $3 OFFSET $4`,
    [opts.category ?? null, opts.assetId ?? null, limit + 1, (page - 1) * limit],
  );
  const rows = res.rows.map(toTopic);
  return { topics: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function categoryStats(): Promise<Record<string, { topics: number; lastPostAt: number | null }>> {
  const res = await pool().query<{ category: string; n: number; last: Date | null }>(
    `SELECT category, count(*)::int AS n, max(last_post_at) AS last FROM forum_topics WHERE status = 'visible' GROUP BY category`,
  );
  return Object.fromEntries(res.rows.map((r) => [r.category, { topics: r.n, lastPostAt: r.last?.getTime() ?? null }]));
}

/** A topic its viewer may see: visible, or held/removed for its author and moderators. */
export async function getTopic(id: string, viewer: Viewer | null): Promise<TopicSummary | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const res = await pool().query<TopicRecord>(`${TOPIC_SELECT} WHERE t.id = $1`, [id]);
  const r = res.rows[0];
  if (!r) return null;
  if (r.status === "visible" || (r.status === "held" && viewer?.id === r.user_id) || canModerate(viewer)) return toTopic(r);
  return null;
}

interface PostRecord extends AuthorCols {
  id: string;
  topic_id: string;
  is_first: boolean;
  body: string;
  status: Status;
  helpful_count: number;
  created_at: Date;
  edited_at: Date | null;
  voted: boolean;
}

const POST_SELECT = `SELECT p.id::text, p.topic_id::text, p.is_first, p.body, p.status, p.helpful_count, p.created_at, p.edited_at,
    p.user_id, u.chat_name, u.role, u.reputation,
    EXISTS (SELECT 1 FROM forum_votes v WHERE v.post_id = p.id AND v.user_id = $2) AS voted
  FROM forum_posts p JOIN "user" u ON u.id = p.user_id`;

function toPost(r: PostRecord, viewer: Viewer | null, now = Date.now()): ForumPost {
  const mine = viewer?.id === r.user_id;
  return {
    id: r.id,
    topicId: r.topic_id,
    isFirst: r.is_first,
    author: author(r),
    body: r.body,
    createdAt: r.created_at.getTime(),
    editedAt: r.edited_at?.getTime() ?? null,
    helpful: r.helpful_count,
    votedByMe: r.voted,
    status: r.status,
    mine,
    canEdit: mine && r.status !== "removed" && now - r.created_at.getTime() < FORUM_LIMITS.editMs,
  };
}

/**
 * The opening post and one page of replies, oldest first. Held posts show to
 * their author and moderators; moderators also see removed ones.
 */
export async function getPosts(
  topicId: string,
  viewer: Viewer | null,
  page = 1,
): Promise<{ first: ForumPost | null; replies: ForumPost[]; pages: number }> {
  const mod = canModerate(viewer);
  const seen = `(p.status = 'visible' OR (p.status = 'held' AND p.user_id = $2) OR $3)`;
  const per = FORUM_LIMITS.pageSize;
  const [first, replies, count] = await Promise.all([
    pool().query<PostRecord>(`${POST_SELECT} WHERE p.topic_id = $1 AND p.is_first AND ${seen}`, [topicId, viewer?.id ?? "", mod]),
    pool().query<PostRecord>(
      `${POST_SELECT} WHERE p.topic_id = $1 AND NOT p.is_first AND ${seen} ORDER BY p.id LIMIT $4 OFFSET $5`,
      [topicId, viewer?.id ?? "", mod, per, (Math.max(1, page) - 1) * per],
    ),
    pool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM forum_posts p WHERE p.topic_id = $1 AND NOT p.is_first AND ${seen}`,
      [topicId, viewer?.id ?? "", mod],
    ),
  ]);
  return {
    first: first.rows[0] ? toPost(first.rows[0], viewer) : null,
    replies: replies.rows.map((r) => toPost(r, viewer)),
    pages: Math.max(1, Math.ceil(count.rows[0]!.n / per)),
  };
}

/** Visible topics for the sitemap, newest activity first. */
export async function sitemapTopics(limit = 5000): Promise<{ path: string; lastPostAt: Date }[]> {
  const res = await pool().query<{ id: string; title: string; last_post_at: Date }>(
    `SELECT id::text, title, last_post_at FROM forum_topics WHERE status = 'visible' ORDER BY last_post_at DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({ path: topicPath(r.id, r.title), lastPostAt: r.last_post_at }));
}

// ---------------------------------------------------------------------------
// Profiles and reputation

export async function getProfile(name: string, viewer: Viewer | null): Promise<Profile | null> {
  const res = await pool().query<
    AuthorCols & { bio: string | null; createdAt: Date; topics: number; replies: number; helpful: number }
  >(
    `SELECT u.id AS user_id, u.chat_name, u.role, u.reputation, u.bio, u."createdAt",
       (SELECT count(*)::int FROM forum_topics t WHERE t.user_id = u.id AND t.status = 'visible') AS topics,
       (SELECT count(*)::int FROM forum_posts p WHERE p.user_id = u.id AND p.status = 'visible' AND NOT p.is_first) AS replies,
       (SELECT COALESCE(sum(p.helpful_count), 0)::int FROM forum_posts p WHERE p.user_id = u.id AND p.status = 'visible') AS helpful
     FROM "user" u WHERE lower(u.chat_name) = lower($1)`,
    [name],
  );
  const r = res.rows[0];
  if (!r) return null;
  const posts = await pool().query<PostRecord & { title: string; topic_status: Status }>(
    `SELECT p.id::text, p.topic_id::text, p.is_first, p.body, p.status, p.helpful_count, p.created_at, p.edited_at,
       p.user_id, u.chat_name, u.role, u.reputation, false AS voted, t.title, t.status AS topic_status
     FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id JOIN "user" u ON u.id = p.user_id
     WHERE p.user_id = $1 AND p.status = 'visible' AND t.status = 'visible'
     ORDER BY p.id DESC LIMIT 20`,
    [r.user_id],
  );
  return {
    ...author(r),
    bio: r.bio,
    joined: r.createdAt.getTime(),
    trusted: isTrusted(r.reputation, r.createdAt.getTime()),
    topics: r.topics,
    replies: r.replies,
    helpfulReceived: r.helpful,
    recent: posts.rows.map((p) => ({
      ...toPost(p, viewer),
      topicTitle: p.title,
      topicPath: topicPath(p.topic_id, p.title),
    })),
  };
}

export async function topMembers(limit = 10): Promise<ForumAuthor[]> {
  return (
    await pool().query<AuthorCols>(
      `SELECT u.id AS user_id, u.chat_name, u.role, u.reputation FROM "user" u
       WHERE u.reputation > 0 AND u.chat_name IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM chat_bans b WHERE b.user_id = u.id AND (b.until IS NULL OR b.until > now()))
       ORDER BY u.reputation DESC, u."createdAt" LIMIT $1`,
      [limit],
    )
  ).rows.map(author);
}

/** Recounts reputation for these members from their posts' votes and removals. */
export async function recomputeReputation(userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const res = await pool().query<{ id: string; votes: number; removed: number }>(
    `SELECT u.id,
       (SELECT count(*)::int FROM forum_votes v JOIN forum_posts p ON p.id = v.post_id
        WHERE p.user_id = u.id AND p.status = 'visible' AND v.user_id <> u.id) AS votes,
       (SELECT count(*)::int FROM forum_posts p
        WHERE p.user_id = u.id AND p.status = 'removed' AND p.reviewed_by IS DISTINCT FROM u.id) AS removed
     FROM "user" u WHERE u.id = ANY($1)`,
    [ids],
  );
  await Promise.all(
    res.rows.map((r) => pool().query(`UPDATE "user" SET reputation = $2 WHERE id = $1`, [r.id, reputation(r.votes, r.removed)])),
  );
}

/** A short public bio: no links or contact details, nothing the scam filter would hold. */
export async function setBio(v: Viewer, raw: string): Promise<string | null> {
  const bio = cleanBody(String(raw ?? "")).replace(/\s+/g, " ");
  if (bio.length > FORUM_LIMITS.bioMax) return `Keep it under ${FORUM_LIMITS.bioMax} characters.`;
  if (bio && findDomains(bio).length > 0) return "Bios can't contain links.";
  if (bio) {
    const check = checkMessage(bio, { canPostLinks: false, isStaff: v.isStaff, maxLength: FORUM_LIMITS.bioMax });
    if (check.action === "reject") return check.message;
    if (check.action === "hold") return "Bios can't contain contact details, wallet addresses or offers.";
  }
  await pool().query(`UPDATE "user" SET bio = $2 WHERE id = $1`, [v.id, bio || null]);
  return null;
}

// ---------------------------------------------------------------------------
// Writing

export type WriteResult = { ok: true; path: string; held: boolean } | { ok: false; error: string; needCaptcha?: boolean };

/** Rate limits, the first-post bot check and the scam filter, shared by topics and replies. */
async function prepare(
  v: Viewer | null,
  kind: "topic" | "reply",
  rawBody: string,
  captcha: string | undefined,
  ip: string | null,
): Promise<{ ok: true; v: Viewer; body: string; held: boolean; flags: FilterReason[] } | { ok: false; error: string; needCaptcha?: boolean }> {
  const block = postBlock(v);
  if (block || !v) {
    const error =
      block?.reason === "banned"
        ? "A moderator has paused your posting."
        : block?.reason === "new"
          ? "New accounts read along for 10 minutes before posting."
          : block?.reason === "name"
            ? "Pick a public name first."
            : "Please log in to post.";
    return { ok: false, error };
  }

  if (turnstile && !v.isStaff) {
    const before = await pool().query(
      `SELECT 1 FROM forum_posts WHERE user_id = $1 UNION ALL SELECT 1 FROM chat_messages WHERE user_id = $1 LIMIT 1`,
      [v.id],
    );
    if (!before.rowCount) {
      if (!captcha) return { ok: false, error: "Please confirm you're human first.", needCaptcha: true };
      if (!(await verifyTurnstile(captcha, ip))) {
        return { ok: false, error: "The human check didn't pass. Please try again.", needCaptcha: true };
      }
    }
  }

  const body = cleanBody(rawBody);
  const max = kind === "topic" ? FORUM_LIMITS.topicMax : FORUM_LIMITS.replyMax;
  const filter = checkMessage(body, {
    canPostLinks: Date.now() - v.createdAt >= CHAT_LIMITS.noLinksMs,
    isStaff: v.isStaff,
    trustedLinks: isTrusted(v.reputation, v.createdAt),
    maxLength: max,
  });
  if (filter.action === "reject") return { ok: false, error: filter.message };

  if (!v.isStaff) {
    const r = redis();
    try {
      const gapMs = kind === "topic" ? FORUM_LIMITS.topicGapMs : FORUM_LIMITS.replyGapMs;
      const gap = await r.set(`forum:gap:${kind}:${v.id}`, "1", "PX", gapMs, "NX");
      if (gap !== "OK") {
        return {
          ok: false,
          error: kind === "topic" ? "You can start a new topic every 2 minutes." : "Slow down a little: one reply every 15 seconds.",
        };
      }
      const dayKey = `forum:day:${kind}:${v.id}:${new Date().toISOString().slice(0, 10)}`;
      const [[, count]] = (await r.multi().incr(dayKey).expire(dayKey, 86_400).exec()) as [[unknown, number]];
      const cap = kind === "topic" ? FORUM_LIMITS.topicsPerDay : FORUM_LIMITS.repliesPerDay;
      if (count > cap) return { ok: false, error: `That's today's limit of ${cap} ${kind === "topic" ? "topics" : "replies"}.` };
      const digest = createHash("sha1").update(body.toLowerCase()).digest("base64");
      const last = await r.set(`forum:last:${v.id}`, digest, "PX", 3600_000, "GET");
      if (last === digest) return { ok: false, error: "You just posted that." };
    } catch (err) {
      console.error("forum rate limit check failed", err);
      return { ok: false, error: "The forum is having trouble right now. Please try again shortly." };
    }
  }

  const held = filter.action === "hold";
  return { ok: true, v, body, held, flags: held ? filter.reasons : [] };
}

export async function createTopic(
  viewer: Viewer | null,
  input: { category: string; assetId?: string | null; title: string; body: string; captcha?: string; ip: string | null },
): Promise<WriteResult> {
  if (!isForumCategory(input.category)) return { ok: false, error: "Pick a category." };
  const t = checkTitle(String(input.title ?? ""));
  if ("error" in t) return { ok: false, error: t.error };
  const titleCheck = checkMessage(t.title, { canPostLinks: false, isStaff: viewer?.isStaff, maxLength: FORUM_LIMITS.titleMax });
  if (titleCheck.action !== "allow") return { ok: false, error: "Keep links and contact details out of the title." };
  let assetId: string | null = null;
  if (input.assetId) {
    const a = await pool().query<{ id: string }>(`SELECT id FROM assets WHERE id = $1`, [input.assetId]);
    if (!a.rows[0]) return { ok: false, error: "That coin or stock wasn't found." };
    assetId = a.rows[0].id;
  }
  const p = await prepare(viewer, "topic", String(input.body ?? ""), input.captcha, input.ip);
  if (!p.ok) return p;

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const topic = await client.query<{ id: string }>(
      `INSERT INTO forum_topics (category, asset_id, user_id, title, status) VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
      [input.category, assetId, p.v.id, t.title, p.held ? "held" : "visible"],
    );
    const id = topic.rows[0]!.id;
    await client.query(
      `INSERT INTO forum_posts (topic_id, user_id, is_first, body, status, held_by, flags) VALUES ($1, $2, true, $3, $4, $5, $6)`,
      [id, p.v.id, p.body, p.held ? "held" : "visible", p.held ? "filter" : null, p.flags],
    );
    await client.query("COMMIT");
    return { ok: true, path: topicPath(id, t.title), held: p.held };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function createReply(
  viewer: Viewer | null,
  input: { topicId: string; body: string; captcha?: string; ip: string | null },
): Promise<WriteResult & { page?: number }> {
  const topic = await getTopic(String(input.topicId), viewer);
  if (!topic || topic.status !== "visible") return { ok: false, error: "That topic is gone." };
  if (topic.locked && !viewer?.isStaff) return { ok: false, error: "This topic is locked." };
  const p = await prepare(viewer, "reply", String(input.body ?? ""), input.captcha, input.ip);
  if (!p.ok) return p;
  const res = await pool().query<{ id: string }>(
    `INSERT INTO forum_posts (topic_id, user_id, body, status, held_by, flags) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
    [topic.id, p.v.id, p.body, p.held ? "held" : "visible", p.held ? "filter" : null, p.flags],
  );
  await syncTopics([topic.id]);
  const before = await pool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM forum_posts WHERE topic_id = $1 AND NOT is_first AND id < $2 AND (status = 'visible' OR user_id = $3)`,
    [topic.id, res.rows[0]!.id, p.v.id],
  );
  const page = Math.floor(before.rows[0]!.n / FORUM_LIMITS.pageSize) + 1;
  return { ok: true, path: `${topic.path}${page > 1 ? `?page=${page}` : ""}#p${res.rows[0]!.id}`, held: p.held, page };
}

/** Members can fix their posts for an hour. The new text goes through the filter again. */
export async function editPost(v: Viewer, postId: string, rawBody: string, rawTitle?: string): Promise<string | null> {
  const res = await pool().query<{ user_id: string; topic_id: string; is_first: boolean; created_at: Date; status: Status }>(
    `SELECT user_id, topic_id::text, is_first, created_at, status FROM forum_posts WHERE id = $1`,
    [postId],
  );
  const post = res.rows[0];
  if (!post || post.user_id !== v.id || post.status === "removed") return "That post is gone.";
  if (Date.now() - post.created_at.getTime() >= FORUM_LIMITS.editMs) return "Posts can only be edited in their first hour.";
  if (v.bannedUntil != null) return "A moderator has paused your posting.";

  let title: string | null = null;
  if (post.is_first && rawTitle != null) {
    const t = checkTitle(rawTitle);
    if ("error" in t) return t.error;
    if (checkMessage(t.title, { canPostLinks: false, isStaff: v.isStaff, maxLength: FORUM_LIMITS.titleMax }).action !== "allow") {
      return "Keep links and contact details out of the title.";
    }
    title = t.title;
  }
  const body = cleanBody(String(rawBody ?? ""));
  const filter = checkMessage(body, {
    canPostLinks: Date.now() - v.createdAt >= CHAT_LIMITS.noLinksMs,
    isStaff: v.isStaff,
    trustedLinks: isTrusted(v.reputation, v.createdAt),
    maxLength: post.is_first ? FORUM_LIMITS.topicMax : FORUM_LIMITS.replyMax,
  });
  if (filter.action === "reject") return filter.message;
  const held = filter.action === "hold";
  // An edit that trips the filter goes back to the queue; a clean edit of a
  // post hidden by reports stays hidden until a moderator looks.
  await pool().query(
    `UPDATE forum_posts SET body = $2, edited_at = now(),
       status = CASE WHEN $3 THEN 'held' ELSE status END,
       held_by = CASE WHEN $3 THEN 'filter' ELSE held_by END,
       flags = CASE WHEN $3 THEN $4::text[] ELSE flags END,
       reviewed_at = CASE WHEN $3 THEN NULL ELSE reviewed_at END
     WHERE id = $1`,
    [postId, body, held, held ? filter.reasons : []],
  );
  if (title) await pool().query(`UPDATE forum_topics SET title = $2 WHERE id = $1`, [post.topic_id, title]);
  await syncTopics([post.topic_id]);
  return null;
}

/** Deleting the opening post deletes the topic. */
export async function deleteOwnPost(v: Viewer, postId: string): Promise<{ topicGone: boolean } | null> {
  const res = await pool().query<{ topic_id: string; is_first: boolean }>(
    `UPDATE forum_posts SET status = 'removed', reviewed_at = now(), reviewed_by = $2
     WHERE id = $1 AND user_id = $2 AND status <> 'removed' RETURNING topic_id::text, is_first`,
    [postId, v.id],
  );
  const row = res.rows[0];
  if (!row) return null;
  await syncTopics([row.topic_id]);
  await recomputeReputation([v.id]);
  return { topicGone: row.is_first };
}

export async function setHelpful(v: Viewer, postId: string, on: boolean): Promise<string | null> {
  const res = await pool().query<{ user_id: string; status: Status }>(`SELECT user_id, status FROM forum_posts WHERE id = $1`, [postId]);
  const post = res.rows[0];
  if (!post || post.status !== "visible") return "That post is gone.";
  if (post.user_id === v.id) return "You can't vote for your own post.";
  if (v.bannedUntil != null) return "A moderator has paused your account.";
  if (!v.isStaff && Date.now() - v.createdAt < CHAT_LIMITS.noLinksMs) return "New accounts can vote after their first day.";
  if (on) {
    const key = `forum:votes:${v.id}:${Math.floor(Date.now() / 3600_000)}`;
    try {
      const [[, n]] = (await redis().multi().incr(key).expire(key, 3600).exec()) as [[unknown, number]];
      if (n > 60) return "That's a lot of votes. Try again in a while.";
    } catch (err) {
      console.error("vote rate limit check failed", err);
    }
    const ins = await pool().query(`INSERT INTO forum_votes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, v.id]);
    if (ins.rowCount) await pool().query(`UPDATE forum_posts SET helpful_count = helpful_count + 1 WHERE id = $1`, [postId]);
  } else {
    const del = await pool().query(`DELETE FROM forum_votes WHERE post_id = $1 AND user_id = $2`, [postId, v.id]);
    if (del.rowCount) await pool().query(`UPDATE forum_posts SET helpful_count = helpful_count - 1 WHERE id = $1`, [postId]);
  }
  await recomputeReputation([post.user_id]);
  return null;
}

/** Trusted members' reports count double, so two of them hide a post. */
export async function reportPost(v: Viewer, postId: string, reason: ReportReason): Promise<string | null> {
  if (!v.isStaff && Date.now() - v.createdAt < CHAT_LIMITS.readOnlyMs) {
    return "New accounts can report posts after their first 10 minutes.";
  }
  const post = await pool().query<{ user_id: string }>(`SELECT user_id FROM forum_posts WHERE id = $1`, [postId]);
  if (!post.rows[0]) return "That post is gone.";
  if (post.rows[0].user_id === v.id) return "You can't report your own post.";
  const ins = await pool().query(
    `INSERT INTO forum_reports (post_id, reporter_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [postId, v.id, reason],
  );
  if (!ins.rowCount) return null;
  const weight = isTrusted(v.reputation, v.createdAt) ? 2 : 1;
  const res = await pool().query<{ topic_id: string }>(
    `UPDATE forum_posts SET report_count = report_count + $3,
       status = CASE WHEN status = 'visible' AND reviewed_at IS NULL AND report_count + $3 >= $2 THEN 'held' ELSE status END,
       held_by = CASE WHEN status = 'visible' AND reviewed_at IS NULL AND report_count + $3 >= $2 THEN 'reports' ELSE held_by END
     WHERE id = $1 RETURNING topic_id::text`,
    [postId, FORUM_LIMITS.reportsToHide, weight],
  );
  if (res.rows[0]) await syncTopics([res.rows[0].topic_id]);
  return null;
}

/**
 * Brings topics in line with their posts: the opening post's status, the
 * visible reply count and the latest activity.
 */
async function syncTopics(topicIds: string[]): Promise<void> {
  const ids = [...new Set(topicIds)];
  if (ids.length === 0) return;
  await pool().query(
    `UPDATE forum_topics t SET
       status = COALESCE((SELECT f.status FROM forum_posts f WHERE f.topic_id = t.id AND f.is_first), 'removed'),
       reply_count = (SELECT count(*)::int FROM forum_posts r WHERE r.topic_id = t.id AND NOT r.is_first AND r.status = 'visible'),
       last_post_at = COALESCE((SELECT max(r.created_at) FROM forum_posts r WHERE r.topic_id = t.id AND r.status = 'visible'), t.created_at)
     WHERE t.id = ANY($1::bigint[])`,
    [ids],
  );
}

// ---------------------------------------------------------------------------
// Moderation

export async function forumQueue(): Promise<ForumQueueItem[]> {
  const res = await pool().query<
    PostRecord & {
      title: string;
      held_by: "filter" | "reports" | null;
      flags: FilterReason[];
      reports: { reason: ReportReason; n: number }[] | null;
      author_joined: Date;
      author_posts: number;
    }
  >(
    `SELECT p.id::text, p.topic_id::text, p.is_first, p.body, p.status, p.helpful_count, p.created_at, p.edited_at,
       p.user_id, u.chat_name, u.role, u.reputation, false AS voted, t.title, p.held_by, p.flags,
       u."createdAt" AS author_joined,
       (SELECT count(*)::int FROM forum_posts x WHERE x.user_id = p.user_id) AS author_posts,
       (SELECT json_agg(json_build_object('reason', reason, 'n', n)) FROM
          (SELECT reason, count(*)::int AS n FROM forum_reports r WHERE r.post_id = p.id GROUP BY reason) g) AS reports
     FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id JOIN "user" u ON u.id = p.user_id
     WHERE p.status = 'held' OR (p.status = 'visible' AND p.report_count > 0 AND p.reviewed_at IS NULL)
     ORDER BY p.id LIMIT 200`,
  );
  return res.rows.map((r) => ({
    ...toPost(r, null),
    topicTitle: r.title,
    topicPath: topicPath(r.topic_id, r.title),
    heldBy: r.held_by,
    flags: r.flags,
    reports: r.reports ?? [],
    authorJoined: r.author_joined.getTime(),
    authorPosts: r.author_posts,
  }));
}

export async function approvePosts(mod: Viewer, ids: string[]): Promise<void> {
  const res = await pool().query<{ topic_id: string; user_id: string }>(
    `UPDATE forum_posts SET status = 'visible', reviewed_at = now(), reviewed_by = $2
     WHERE id = ANY($1::bigint[]) AND status <> 'removed' RETURNING topic_id::text, user_id`,
    [ids, mod.id],
  );
  await syncTopics(res.rows.map((r) => r.topic_id));
  await recomputeReputation(res.rows.map((r) => r.user_id));
}

export async function removePosts(mod: Viewer, ids: string[]): Promise<void> {
  const res = await pool().query<{ topic_id: string; user_id: string }>(
    `UPDATE forum_posts SET status = 'removed', reviewed_at = now(), reviewed_by = $2
     WHERE id = ANY($1::bigint[]) AND status <> 'removed' RETURNING topic_id::text, user_id`,
    [ids, mod.id],
  );
  await syncTopics(res.rows.map((r) => r.topic_id));
  await recomputeReputation(res.rows.map((r) => r.user_id));
}

/** Part of a ban: removes what the person posted in the forum in the last day, like chat. */
export async function removeRecentPosts(mod: Viewer, userId: string): Promise<void> {
  const res = await pool().query<{ topic_id: string }>(
    `UPDATE forum_posts SET status = 'removed', reviewed_at = now(), reviewed_by = $2
     WHERE user_id = $1 AND status <> 'removed' AND created_at > now() - interval '1 day' RETURNING topic_id::text`,
    [userId, mod.id],
  );
  await syncTopics(res.rows.map((r) => r.topic_id));
  await recomputeReputation([userId]);
}

export async function setTopicFlag(topicId: string, flag: "pinned" | "locked", value: boolean): Promise<void> {
  await pool().query(`UPDATE forum_topics SET ${flag === "pinned" ? "pinned" : "locked"} = $2 WHERE id = $1`, [topicId, value]);
}

/** The signed-in person as the forum's client components need them. */
export async function forumViewer(): Promise<{ viewer: Viewer | null; me: ForumMe | null }> {
  const session = await getSession();
  const viewer = session ? await getViewer(session.user.id) : null;
  return {
    viewer,
    me: viewer && { id: viewer.id, canModerate: canModerate(viewer), block: postBlock(viewer) },
  };
}
