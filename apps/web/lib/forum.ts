import "server-only";
import { createHash } from "node:crypto";
import {
  badgeFor,
  CHAT_LIMITS,
  checkMessage,
  checkTitle,
  cleanBody,
  communityLabel,
  communityPath,
  findDomains,
  FORUM_LIMITS,
  hotRank,
  isStance,
  isTrusted,
  MAX_DEPTH,
  reputation,
  TOP_WINDOWS,
  topicPath,
  VOTE_LIMITS,
  voteDelta,
  voteProblem,
  type AssetClass,
  type ChatRole,
  type CommunityKind,
  type FilterReason,
  type Namespace,
  type ReportReason,
  type Stance,
  type TopicSort,
  type TopWindow,
  type VoteValue,
} from "@midbig/shared";
import { getSession, turnstile } from "./auth";
import { answerPostMentions } from "./bots";
import { canModerate, getViewer, postBlock, verifyTurnstile, type Viewer } from "./chat";
import { canModerateCommunity, getCommunityById, setMember, type Community } from "./communities";
import { pool, redis } from "./server";
import { classEnabled, enabledClasses } from "./settings";
import type { ForumAuthor, ForumMe, ForumPost, ForumQueueItem, Profile, TopicSummary } from "./types";

type Status = "visible" | "held" | "removed";

interface AuthorCols {
  user_id: string;
  chat_name: string | null;
  role: ChatRole;
  reputation: number;
  is_bot: boolean;
  verified: boolean;
}

function author(r: AuthorCols): ForumAuthor {
  return {
    id: r.user_id,
    name: r.chat_name ?? "member",
    badge: badgeFor(r.role, r.is_bot),
    reputation: r.reputation,
    verified: r.verified,
  };
}

// ---------------------------------------------------------------------------
// Reading

interface TopicRecord extends AuthorCols {
  id: string;
  title: string;
  community_id: string;
  c_ns: Namespace;
  c_slug: string;
  c_kind: CommunityKind;
  c_class: AssetClass | null;
  c_title: string;
  asset_id: string | null;
  asset_symbol: string | null;
  status: Status;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  score: number;
  stance: Stance | null;
  my_vote: number;
  first_post_id: string | null;
  last_post_at: Date;
  created_at: Date;
}

/** $1 is always the viewer's id ("" when logged out), for their vote. */
const TOPIC_SELECT = `SELECT t.id::text, t.title, t.community_id::text, c.ns AS c_ns, c.slug AS c_slug, c.kind AS c_kind,
    c.asset_class AS c_class, c.title AS c_title, t.asset_id, upper(a.symbol) AS asset_symbol, t.status, t.pinned, t.locked,
    t.reply_count, t.score, t.stance, t.last_post_at, t.created_at, t.user_id, u.chat_name, u.role, u.reputation, u.is_bot, u.verified,
    f.id::text AS first_post_id, COALESCE(v.value, 0)::int AS my_vote
  FROM forum_topics t
  JOIN communities c ON c.id = t.community_id
  JOIN "user" u ON u.id = t.user_id
  LEFT JOIN assets a ON a.id = t.asset_id
  LEFT JOIN forum_posts f ON f.topic_id = t.id AND f.is_first
  LEFT JOIN forum_votes v ON v.post_id = f.id AND v.user_id = $1`;

function toTopic(r: TopicRecord): TopicSummary {
  const key = { ns: r.c_ns, slug: r.c_slug, assetClass: r.c_class, kind: r.c_kind };
  return {
    id: r.id,
    title: r.title,
    path: topicPath(r.id, r.title),
    community: { id: r.community_id, label: communityLabel(key), path: communityPath(key), title: r.c_title },
    assetId: r.asset_id,
    assetSymbol: r.asset_symbol,
    author: author(r),
    replies: r.reply_count,
    score: r.score,
    myVote: (r.my_vote || 0) as VoteValue,
    firstPostId: r.first_post_id,
    stance: r.stance,
    lastPostAt: r.last_post_at.getTime(),
    createdAt: r.created_at.getTime(),
    pinned: r.pinned,
    locked: r.locked,
    status: r.status,
  };
}

/**
 * Visible topics in active communities whose category is on: in one
 * community, in a set of them (a member's feed), about one asset, or
 * everywhere. Sorted hot, new, or top over a window. Pinned topics lead a
 * single community's hot list.
 */
export async function listTopics(opts: {
  communityId?: string;
  communityIds?: string[];
  assetId?: string;
  sort?: TopicSort;
  window?: TopWindow;
  page?: number;
  limit?: number;
  viewerId?: string;
}): Promise<{ topics: TopicSummary[]; hasMore: boolean }> {
  const limit = opts.limit ?? FORUM_LIMITS.pageSize;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const sort = opts.sort ?? "hot";
  const days = sort === "top" ? TOP_WINDOWS[opts.window ?? "week"].days : null;
  const order =
    sort === "new"
      ? "t.created_at DESC"
      : sort === "top"
        ? "t.score DESC, t.created_at DESC"
        : `${opts.communityId ? "t.pinned DESC, " : ""}t.hot DESC`;
  const res = await pool().query<TopicRecord>(
    `${TOPIC_SELECT}
     WHERE t.status = 'visible' AND c.status = 'active' AND (c.asset_class IS NULL OR c.asset_class = ANY($2))
       AND ($3::bigint IS NULL OR t.community_id = $3)
       AND ($4::bigint[] IS NULL OR t.community_id = ANY($4))
       AND ($5::text IS NULL OR t.asset_id = $5)
       AND ($6::int IS NULL OR t.created_at > now() - $6 * interval '1 day')
     ORDER BY ${order} LIMIT $7 OFFSET $8`,
    [
      opts.viewerId ?? "",
      await enabledClasses(),
      opts.communityId ?? null,
      opts.communityIds ?? null,
      opts.assetId ?? null,
      days,
      limit + 1,
      (page - 1) * limit,
    ],
  );
  const rows = res.rows.map(toTopic);
  return { topics: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** A topic its viewer may see: visible, or held/removed for its author and moderators. */
export async function getTopic(id: string, viewer: Viewer | null): Promise<TopicSummary | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const res = await pool().query<TopicRecord>(`${TOPIC_SELECT} WHERE t.id = $2`, [viewer?.id ?? "", id]);
  const r = res.rows[0];
  if (!r) return null;
  if (r.status === "visible" || (r.status === "held" && viewer?.id === r.user_id) || canModerate(viewer)) return toTopic(r);
  return null;
}

interface PostRecord extends AuthorCols {
  id: string;
  topic_id: string;
  parent_id: string | null;
  depth: number;
  is_first: boolean;
  body: string;
  status: Status;
  score: number;
  created_at: Date;
  edited_at: Date | null;
  my_vote: number;
}

/** $2 is the viewer's id, for their vote. */
const POST_SELECT = `SELECT p.id::text, p.topic_id::text, p.parent_id::text, p.depth, p.is_first, p.body, p.status, p.score,
    p.created_at, p.edited_at, p.user_id, u.chat_name, u.role, u.reputation, u.is_bot, u.verified,
    COALESCE((SELECT v.value FROM forum_votes v WHERE v.post_id = p.id AND v.user_id = $2), 0)::int AS my_vote
  FROM forum_posts p JOIN "user" u ON u.id = p.user_id`;

function toPost(r: PostRecord, viewer: Viewer | null, now = Date.now()): ForumPost {
  const mine = viewer?.id === r.user_id;
  return {
    id: r.id,
    topicId: r.topic_id,
    parentId: r.parent_id,
    depth: r.depth,
    isFirst: r.is_first,
    author: author(r),
    body: r.body,
    createdAt: r.created_at.getTime(),
    editedAt: r.edited_at?.getTime() ?? null,
    score: r.score,
    myVote: (r.my_vote || 0) as VoteValue,
    status: r.status,
    mine,
    canEdit: mine && r.status !== "removed" && now - r.created_at.getTime() < FORUM_LIMITS.editMs,
  };
}

/**
 * The opening post and up to FORUM_LIMITS.commentsMax comments, flat with
 * their parent ids (the page builds the tree). Held posts show to their
 * author and moderators; moderators also see removed ones. Removed comments
 * with visible replies stay as a placeholder so the thread keeps its shape.
 */
export async function getPosts(
  topicId: string,
  viewer: Viewer | null,
  mod = canModerate(viewer),
): Promise<{ first: ForumPost | null; comments: ForumPost[] }> {
  const seen = `(p.status = 'visible' OR (p.status = 'held' AND p.user_id = $2) OR $3
     OR (p.status = 'removed' AND EXISTS (SELECT 1 FROM forum_posts k WHERE k.parent_id = p.id AND k.status = 'visible')))`;
  const res = await pool().query<PostRecord>(
    `${POST_SELECT} WHERE p.topic_id = $1 AND ${seen} ORDER BY p.is_first DESC, p.id LIMIT $4`,
    [topicId, viewer?.id ?? "", mod, FORUM_LIMITS.commentsMax + 1],
  );
  const posts = res.rows.map((r) => {
    const p = toPost(r, viewer);
    // A placeholder for a removed comment keeps nothing of what it said.
    return p.status === "removed" && !mod ? { ...p, body: "", author: { ...p.author, id: "", name: "[removed]" } } : p;
  });
  const first = posts[0]?.isFirst ? posts[0] : null;
  return { first, comments: posts.filter((p) => !p.isFirst) };
}

/** Visible topics for the sitemap, newest activity first. */
export async function sitemapTopics(limit = 5000): Promise<{ path: string; lastPostAt: Date }[]> {
  const res = await pool().query<{ id: string; title: string; last_post_at: Date }>(
    `SELECT t.id::text, t.title, t.last_post_at FROM forum_topics t JOIN communities c ON c.id = t.community_id
     WHERE t.status = 'visible' AND c.status = 'active' AND (c.asset_class IS NULL OR c.asset_class = ANY($2))
     ORDER BY t.last_post_at DESC LIMIT $1`,
    [limit, await enabledClasses()],
  );
  return res.rows.map((r) => ({ path: topicPath(r.id, r.title), lastPostAt: r.last_post_at }));
}

// ---------------------------------------------------------------------------
// Profiles and reputation

export async function getProfile(name: string, viewer: Viewer | null): Promise<Profile | null> {
  const res = await pool().query<
    AuthorCols & { bio: string | null; createdAt: Date; topics: number; replies: number; score: number }
  >(
    `SELECT u.id AS user_id, u.chat_name, u.role, u.reputation, u.is_bot, u.verified, u.bio, u."createdAt",
       (SELECT count(*)::int FROM forum_topics t WHERE t.user_id = u.id AND t.status = 'visible') AS topics,
       (SELECT count(*)::int FROM forum_posts p WHERE p.user_id = u.id AND p.status = 'visible' AND NOT p.is_first) AS replies,
       (SELECT COALESCE(sum(p.score), 0)::int FROM forum_posts p WHERE p.user_id = u.id AND p.status = 'visible') AS score
     FROM "user" u WHERE lower(u.chat_name) = lower($1)`,
    [name],
  );
  const r = res.rows[0];
  if (!r) return null;
  const posts = await pool().query<PostRecord & { title: string }>(
    `${POST_SELECT.replace("FROM forum_posts p", ", t.title FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id")}
     WHERE p.user_id = $1 AND p.status = 'visible' AND t.status = 'visible'
     ORDER BY p.id DESC LIMIT 20`,
    [r.user_id, viewer?.id ?? ""],
  );
  return {
    ...author(r),
    bio: r.bio,
    joined: r.createdAt.getTime(),
    trusted: isTrusted(r.reputation, r.createdAt.getTime()),
    topics: r.topics,
    replies: r.replies,
    scoreReceived: r.score,
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
      `SELECT u.id AS user_id, u.chat_name, u.role, u.reputation, u.is_bot, u.verified FROM "user" u
       WHERE u.reputation > 0 AND u.chat_name IS NOT NULL AND NOT u.is_bot
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
       (SELECT COALESCE(sum(v.value), 0)::int FROM forum_votes v JOIN forum_posts p ON p.id = v.post_id
        WHERE p.user_id = u.id AND p.status = 'visible' AND v.user_id <> u.id) AS votes,
       (SELECT count(*)::int FROM forum_posts p
        WHERE p.user_id = u.id AND p.status = 'removed' AND p.reviewed_by IS DISTINCT FROM u.id) AS removed
     FROM "user" u WHERE u.id = ANY($1) AND NOT u.is_bot`,
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
          error: kind === "topic" ? "You can start a new topic every 2 minutes." : "Slow down a little: one comment every 15 seconds.",
        };
      }
      const dayKey = `forum:day:${kind}:${v.id}:${new Date().toISOString().slice(0, 10)}`;
      const [[, count]] = (await r.multi().incr(dayKey).expire(dayKey, 86_400).exec()) as [[unknown, number]];
      const cap = kind === "topic" ? FORUM_LIMITS.topicsPerDay : FORUM_LIMITS.repliesPerDay;
      if (count > cap) return { ok: false, error: `That's today's limit of ${cap} ${kind === "topic" ? "topics" : "comments"}.` };
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

/** An active community whose category is on, or why it can't take posts. */
async function postableCommunity(communityId: string): Promise<Community | string> {
  const c = await getCommunityById(communityId);
  if (!c || c.status !== "active" || !(await classEnabled(c.assetClass))) return "Pick a community to post in.";
  return c;
}

export async function createTopic(
  viewer: Viewer | null,
  input: { communityId: string; title: string; body: string; stance?: Stance | null; captcha?: string; ip: string | null },
): Promise<WriteResult> {
  const c = await postableCommunity(String(input.communityId ?? ""));
  if (typeof c === "string") return { ok: false, error: c };
  const t = checkTitle(String(input.title ?? ""));
  if ("error" in t) return { ok: false, error: t.error };
  const titleCheck = checkMessage(t.title, { canPostLinks: false, isStaff: viewer?.isStaff, maxLength: FORUM_LIMITS.titleMax });
  if (titleCheck.action !== "allow") return { ok: false, error: "Keep links and contact details out of the title." };
  const stance = isStance(input.stance) ? input.stance : null;
  const p = await prepare(viewer, "topic", String(input.body ?? ""), input.captcha, input.ip);
  if (!p.ok) return p;

  const client = await pool().connect();
  let id: string;
  let postId: string;
  try {
    await client.query("BEGIN");
    const topic = await client.query<{ id: string }>(
      `INSERT INTO forum_topics (community_id, asset_id, user_id, title, status, stance, hot)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
      [c.id, c.assetId, p.v.id, t.title, p.held ? "held" : "visible", stance, hotRank(0, Date.now())],
    );
    id = topic.rows[0]!.id;
    const post = await client.query<{ id: string }>(
      `INSERT INTO forum_posts (topic_id, user_id, is_first, body, status, held_by, flags) VALUES ($1, $2, true, $3, $4, $5, $6) RETURNING id::text`,
      [id, p.v.id, p.body, p.held ? "held" : "visible", p.held ? "filter" : null, p.flags],
    );
    postId = post.rows[0]!.id;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await syncTopics([id]);
  // Posting in a community joins it.
  await setMember(p.v, c.id, true).catch(() => null);
  if (!p.held) void answerPostMentions({ postId, body: p.body, askerId: p.v.id });
  return { ok: true, path: topicPath(id, t.title), held: p.held };
}

export async function createReply(
  viewer: Viewer | null,
  input: { topicId: string; parentId?: string | null; body: string; captcha?: string; ip: string | null },
): Promise<WriteResult> {
  const topic = await getTopic(String(input.topicId), viewer);
  if (!topic || topic.status !== "visible") return { ok: false, error: "That topic is gone." };
  const c = await postableCommunity(topic.community.id);
  if (typeof c === "string") return { ok: false, error: "This community is closed." };
  if (topic.locked && !(await canModerateCommunity(viewer, c.id))) return { ok: false, error: "This topic is locked." };
  let parentId: string | null = null;
  let depth = 0;
  if (input.parentId) {
    const parent = await pool().query<{ id: string; depth: number; parent_id: string | null; status: Status; is_first: boolean }>(
      `SELECT id::text, depth, parent_id::text, status, is_first FROM forum_posts WHERE id = $1 AND topic_id = $2`,
      [input.parentId, topic.id],
    );
    const row = parent.rows[0];
    if (!row || row.status === "removed") return { ok: false, error: "That comment is gone." };
    if (!row.is_first) {
      // Past the deepest level, an answer goes beside the comment it answers.
      if (row.depth + 1 >= MAX_DEPTH) {
        parentId = row.parent_id;
        depth = row.depth;
      } else {
        parentId = row.id;
        depth = row.depth + 1;
      }
    }
  }
  const p = await prepare(viewer, "reply", String(input.body ?? ""), input.captcha, input.ip);
  if (!p.ok) return p;
  const res = await pool().query<{ id: string }>(
    `INSERT INTO forum_posts (topic_id, user_id, parent_id, depth, body, status, held_by, flags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
    [topic.id, p.v.id, parentId, depth, p.body, p.held ? "held" : "visible", p.held ? "filter" : null, p.flags],
  );
  const id = res.rows[0]!.id;
  await syncTopics([topic.id]);
  if (!p.held) void answerPostMentions({ postId: id, body: p.body, askerId: p.v.id });
  return { ok: true, path: `${topic.path}#p${id}`, held: p.held };
}

/** A bot's answer, as a comment under the post that called it. Skips the member rules. */
export async function createBotReply(botUserId: string, postId: string, body: string): Promise<void> {
  const parent = await pool().query<{ topic_id: string; id: string; depth: number; parent_id: string | null; is_first: boolean }>(
    `SELECT topic_id::text, id::text, depth, parent_id::text, is_first FROM forum_posts WHERE id = $1 AND status = 'visible'`,
    [postId],
  );
  const row = parent.rows[0];
  if (!row) return;
  const [parentId, depth] = row.is_first ? [null, 0] : row.depth + 1 >= MAX_DEPTH ? [row.parent_id, row.depth] : [row.id, row.depth + 1];
  await pool().query(
    `INSERT INTO forum_posts (topic_id, user_id, parent_id, depth, body) VALUES ($1, $2, $3, $4, $5)`,
    [row.topic_id, botUserId, parentId, depth, body.slice(0, FORUM_LIMITS.replyMax)],
  );
  await syncTopics([row.topic_id]);
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

/**
 * Sets the viewer's vote on a post: 1 up, -1 down, 0 to take it back. The
 * post's counts, its topic's score and hot rank, and the author's
 * reputation follow.
 */
export async function vote(v: Viewer, postId: string, value: VoteValue): Promise<string | null> {
  const res = await pool().query<{ user_id: string; status: Status; is_bot: boolean }>(
    `SELECT p.user_id, p.status, u.is_bot FROM forum_posts p JOIN "user" u ON u.id = p.user_id WHERE p.id = $1`,
    [postId],
  );
  const post = res.rows[0];
  if (!post || post.status !== "visible") return "That post is gone.";
  if (post.user_id === v.id) return "You can't vote on your own post.";
  if (v.bannedUntil != null) return "A moderator has paused your account.";
  const problem = voteProblem(v, value);
  if (problem) return problem;
  if (value !== 0 && !v.isStaff) {
    const key = `forum:votes:${v.id}:${Math.floor(Date.now() / 3600_000)}`;
    try {
      const [[, n]] = (await redis().multi().incr(key).expire(key, 3600).exec()) as [[unknown, number]];
      if (n > VOTE_LIMITS.perHour) return "That's a lot of votes. Try again in a while.";
    } catch (err) {
      console.error("vote rate limit check failed", err);
    }
  }

  const client = await pool().connect();
  let topicId: string | null = null;
  try {
    await client.query("BEGIN");
    const prev = await client.query<{ value: number }>(
      `SELECT value FROM forum_votes WHERE post_id = $1 AND user_id = $2 FOR UPDATE`,
      [postId, v.id],
    );
    const before = (prev.rows[0]?.value ?? 0) as VoteValue;
    if (before !== value) {
      if (value === 0) await client.query(`DELETE FROM forum_votes WHERE post_id = $1 AND user_id = $2`, [postId, v.id]);
      else {
        await client.query(
          `INSERT INTO forum_votes (post_id, user_id, value) VALUES ($1, $2, $3)
           ON CONFLICT (post_id, user_id) DO UPDATE SET value = EXCLUDED.value, created_at = now()`,
          [postId, v.id, value],
        );
      }
      const d = voteDelta(before, value);
      const upd = await client.query<{ topic_id: string; is_first: boolean }>(
        `UPDATE forum_posts SET ups = ups + $2, downs = downs + $3, score = score + $4 WHERE id = $1 RETURNING topic_id::text, is_first`,
        [postId, d.ups, d.downs, d.score],
      );
      if (upd.rows[0]?.is_first) topicId = upd.rows[0].topic_id;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (topicId) await rankTopics([topicId]);
  if (!post.is_bot) await recomputeReputation([post.user_id]);
  return null;
}

/** A topic's score is its opening post's; hot follows from score and age. */
async function rankTopics(topicIds: string[]): Promise<void> {
  const rows = await pool().query<{ id: string; score: number; created_at: Date }>(
    `UPDATE forum_topics t SET score = COALESCE((SELECT f.score FROM forum_posts f WHERE f.topic_id = t.id AND f.is_first), 0)
     WHERE t.id = ANY($1::bigint[]) RETURNING t.id::text, t.score, t.created_at`,
    [topicIds],
  );
  await Promise.all(
    rows.rows.map((r) => pool().query(`UPDATE forum_topics SET hot = $2 WHERE id = $1`, [r.id, hotRank(r.score, r.created_at.getTime())])),
  );
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
 * Brings topics in line with their posts (the opening post's status, the
 * visible comment count, the latest activity, the score), then their
 * communities' topic counts.
 */
async function syncTopics(topicIds: string[]): Promise<void> {
  const ids = [...new Set(topicIds)];
  if (ids.length === 0) return;
  const res = await pool().query<{ community_id: string }>(
    `UPDATE forum_topics t SET
       status = COALESCE((SELECT f.status FROM forum_posts f WHERE f.topic_id = t.id AND f.is_first), 'removed'),
       reply_count = (SELECT count(*)::int FROM forum_posts r WHERE r.topic_id = t.id AND NOT r.is_first AND r.status = 'visible'),
       last_post_at = COALESCE((SELECT max(r.created_at) FROM forum_posts r WHERE r.topic_id = t.id AND r.status = 'visible'), t.created_at)
     WHERE t.id = ANY($1::bigint[]) RETURNING t.community_id::text`,
    [ids],
  );
  await rankTopics(ids);
  const communities = [...new Set(res.rows.map((r) => r.community_id))];
  await pool().query(
    `UPDATE communities c SET
       topic_count = (SELECT count(*)::int FROM forum_topics t WHERE t.community_id = c.id AND t.status = 'visible'),
       last_post_at = (SELECT max(t.last_post_at) FROM forum_topics t WHERE t.community_id = c.id AND t.status = 'visible')
     WHERE c.id = ANY($1::bigint[])`,
    [communities],
  );
}

// ---------------------------------------------------------------------------
// Moderation

export async function forumQueue(): Promise<ForumQueueItem[]> {
  const res = await pool().query<
    PostRecord & {
      title: string;
      community_label: string;
      held_by: "filter" | "reports" | null;
      flags: FilterReason[];
      reports: { reason: ReportReason; n: number }[] | null;
      author_joined: Date;
      author_posts: number;
    }
  >(
    `${POST_SELECT.replace("$2", "''").replace(
      "FROM forum_posts p",
      `, t.title, c.ns || '/' || c.slug AS community_label, p.held_by, p.flags, u."createdAt" AS author_joined,
       (SELECT count(*)::int FROM forum_posts x WHERE x.user_id = p.user_id) AS author_posts,
       (SELECT json_agg(json_build_object('reason', reason, 'n', n)) FROM
          (SELECT reason, count(*)::int AS n FROM forum_reports r WHERE r.post_id = p.id GROUP BY reason) g) AS reports
       FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id JOIN communities c ON c.id = t.community_id`,
    )}
     WHERE p.status = 'held' OR (p.status = 'visible' AND p.report_count > 0 AND p.reviewed_at IS NULL)
     ORDER BY p.id LIMIT 200`,
  );
  return res.rows.map((r) => ({
    ...toPost(r, null),
    topicTitle: r.title,
    topicPath: topicPath(r.topic_id, r.title),
    communityLabel: r.community_label,
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

/** The community a post belongs to, for checking a community moderator's reach. */
export async function postCommunity(postId: string): Promise<string | null> {
  const res = await pool().query<{ community_id: string }>(
    `SELECT t.community_id::text FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id WHERE p.id = $1`,
    [postId],
  );
  return res.rows[0]?.community_id ?? null;
}

export async function topicCommunity(topicId: string): Promise<string | null> {
  const res = await pool().query<{ community_id: string }>(`SELECT community_id::text FROM forum_topics WHERE id = $1`, [topicId]);
  return res.rows[0]?.community_id ?? null;
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
export async function forumViewer(communityId?: string): Promise<{ viewer: Viewer | null; me: ForumMe | null }> {
  const session = await getSession();
  const viewer = session ? await getViewer(session.user.id) : null;
  return {
    viewer,
    me: viewer && {
      id: viewer.id,
      canModerate: communityId ? await canModerateCommunity(viewer, communityId) : canModerate(viewer),
      isSiteMod: canModerate(viewer),
      block: postBlock(viewer),
      voteBlock: voteProblem(viewer, 1),
      downBlock: voteProblem(viewer, -1),
    },
  };
}
