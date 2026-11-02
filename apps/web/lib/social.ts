import "server-only";
import {
  badgesFor,
  findMentions,
  isReaction,
  mediaUrl,
  milestonePassed,
  pollShares,
  profilePath,
  REACTIONS,
  tickerPath,
  topicPath,
  type Badge,
  type MediaType,
  type NotificationKind,
  type Reaction,
  withoutQuotes,
} from "@midbig/shared";
import type { PoolClient } from "pg";
import type { Viewer } from "./chat";
import { cached, pool, redis } from "./server";

// ---------------------------------------------------------------------------
// Follows

export async function setFollow(v: Viewer, otherId: string, on: boolean): Promise<string | null> {
  if (otherId === v.id) return "You can't follow yourself.";
  if (on) {
    const other = await pool().query<{ is_bot: boolean }>(`SELECT is_bot FROM "user" WHERE id = $1 AND chat_name IS NOT NULL`, [otherId]);
    if (!other.rows[0]) return "That member is gone.";
    const ins = await pool().query(`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [v.id, otherId]);
    if (ins.rowCount && !other.rows[0].is_bot) await notify(otherId, "follow", v.id, null);
  } else {
    await pool().query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [v.id, otherId]);
  }
  return null;
}

export async function followingIds(userId: string): Promise<string[]> {
  const res = await pool().query<{ followee_id: string }>(`SELECT followee_id FROM follows WHERE follower_id = $1`, [userId]);
  return res.rows.map((r) => r.followee_id);
}

export interface FollowPerson {
  id: string;
  name: string;
  avatar: string | null;
}

/** Who follows this member, or who they follow, newest first. */
export async function followList(userId: string, which: "followers" | "following", limit = 200): Promise<FollowPerson[]> {
  const [me, them] = which === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
  const res = await pool().query<{ id: string; chat_name: string; mime: MediaType | null; avatar_id: string | null }>(
    `SELECT u.id, u.chat_name, u.avatar_id, (SELECT m.mime FROM media m WHERE m.id = u.avatar_id AND m.status = 'visible') AS mime
     FROM follows f JOIN "user" u ON u.id = f.${them}
     WHERE f.${me} = $1 AND u.chat_name IS NOT NULL ORDER BY f.created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return res.rows.map((r) => ({ id: r.id, name: r.chat_name, avatar: r.avatar_id && r.mime ? mediaUrl(r.avatar_id, r.mime) : null }));
}

// ---------------------------------------------------------------------------
// Notifications

/**
 * Tells a member something happened. Never for their own actions, never
 * from someone they muted, and only once per kind, post and person.
 */
export async function notify(
  userId: string,
  kind: NotificationKind,
  actorId: string | null,
  postId: string | null,
  detail: Record<string, string | number> = {},
  db: Pick<PoolClient, "query"> = pool(),
): Promise<void> {
  if (actorId === userId) return;
  await db.query(
    `INSERT INTO notifications (user_id, kind, actor_id, post_id, detail)
     SELECT $1, $2, $3, $4, $5
     WHERE NOT EXISTS (SELECT 1 FROM chat_mutes m WHERE m.user_id = $1 AND m.muted_user_id = $3)
       AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = $1 AND NOT u.is_bot)
     ON CONFLICT DO NOTHING`,
    [userId, kind, actorId, postId, detail],
  );
  void redis().del(`notif:unread:${userId}`).catch(() => {});
}

/**
 * After a visible post goes up: the author of the post it answers hears
 * about the reply, and every @named member about the mention.
 */
export async function notifyForPost(post: { id: string; authorId: string; body: string; parentId: string | null; topicId: string; isFirst: boolean }): Promise<void> {
  const told = new Set<string>([post.authorId]);
  if (!post.isFirst) {
    const res = await pool().query<{ user_id: string }>(
      post.parentId
        ? `SELECT user_id FROM forum_posts WHERE id = $1`
        : `SELECT user_id FROM forum_posts WHERE topic_id = $1 AND is_first`,
      [post.parentId ?? post.topicId],
    );
    const to = res.rows[0]?.user_id;
    if (to && !told.has(to)) {
      told.add(to);
      await notify(to, "reply", post.authorId, post.id);
    }
  }
  const names = findMentions(withoutQuotes(post.body)).users.slice(0, 10);
  if (names.length === 0) return;
  const users = await pool().query<{ id: string }>(
    `SELECT id FROM "user" WHERE lower(chat_name) = ANY($1) AND NOT is_bot`,
    [names.map((n) => n.toLowerCase())],
  );
  for (const u of users.rows) {
    if (told.has(u.id)) continue;
    told.add(u.id);
    await notify(u.id, "mention", post.authorId, post.id);
  }
}

/** A post crossed an upvote milestone (10, 50, 100…): its author hears about it. */
export async function notifyMilestone(postId: string, before: number, after: number): Promise<void> {
  const m = milestonePassed(before, after);
  if (m == null) return;
  const res = await pool().query<{ user_id: string }>(`SELECT user_id FROM forum_posts WHERE id = $1`, [postId]);
  if (res.rows[0]) await notify(res.rows[0].user_id, "milestone", null, postId, { n: m });
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  actor: { name: string; avatar: string | null } | null;
  /** Where clicking it goes. */
  href: string;
  /** What it's about: the topic title, or a bit of the comment. */
  about: string | null;
  n: number | null;
  read: boolean;
  at: number;
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationItem[]> {
  const res = await pool().query<{
    id: string;
    kind: NotificationKind;
    chat_name: string | null;
    avatar_id: string | null;
    mime: MediaType | null;
    post_id: string | null;
    topic_id: string | null;
    title: string | null;
    is_first: boolean | null;
    body: string | null;
    detail: { n?: number };
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT n.id::text, n.kind, a.chat_name, a.avatar_id,
       (SELECT m.mime FROM media m WHERE m.id = a.avatar_id AND m.status = 'visible') AS mime,
       n.post_id::text, p.topic_id::text, t.title, p.is_first, left(p.body, 140) AS body, n.detail, n.read_at, n.created_at
     FROM notifications n
     LEFT JOIN "user" a ON a.id = n.actor_id
     LEFT JOIN forum_posts p ON p.id = n.post_id
     LEFT JOIN forum_topics t ON t.id = p.topic_id
     WHERE n.user_id = $1 AND (n.post_id IS NULL OR (p.status = 'visible' AND t.status = 'visible'))
     ORDER BY n.id DESC LIMIT $2`,
    [userId, limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    actor: r.chat_name ? { name: r.chat_name, avatar: r.avatar_id && r.mime ? mediaUrl(r.avatar_id, r.mime) : null } : null,
    href:
      r.topic_id && r.title
        ? `${topicPath(r.topic_id, r.title)}${r.is_first ? "" : `#p${r.post_id}`}`
        : r.chat_name
          ? profilePath(r.chat_name)
          : "/notifications",
    about: r.kind === "reply" || r.kind === "mention" ? (r.body ? withoutQuotes(r.body) || r.body : r.title) : r.title,
    n: r.detail?.n ?? null,
    read: r.read_at != null,
    at: r.created_at.getTime(),
  }));
}

/** Unread count for the bell, cached briefly since every page shows it. */
export async function unreadCount(userId: string): Promise<number> {
  const key = `notif:unread:${userId}`;
  try {
    const hit = await redis().get(key);
    if (hit != null) return Number(hit);
  } catch {
    // Fall through to the database.
  }
  const res = await pool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM notifications WHERE user_id = $1 AND read_at IS NULL LIMIT 99) x`,
    [userId],
  );
  const n = res.rows[0]?.n ?? 0;
  void redis().set(key, String(n), "EX", 60).catch(() => {});
  return n;
}

export async function markAllRead(userId: string): Promise<void> {
  await pool().query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  // Keep the list short: drop read ones older than 90 days.
  await pool().query(`DELETE FROM notifications WHERE user_id = $1 AND read_at < now() - interval '90 days'`, [userId]);
  await redis().del(`notif:unread:${userId}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Saved topics

export async function setSaved(v: Viewer, topicId: string, on: boolean): Promise<string | null> {
  if (on) {
    const n = await pool().query<{ n: number }>(`SELECT count(*)::int AS n FROM saved_topics WHERE user_id = $1`, [v.id]);
    if ((n.rows[0]?.n ?? 0) >= 1000) return "You've saved 1,000 topics. Unsave a few first.";
    const t = await pool().query(`SELECT 1 FROM forum_topics WHERE id = $1 AND status = 'visible'`, [topicId]);
    if (!t.rowCount) return "That topic is gone.";
    await pool().query(`INSERT INTO saved_topics (user_id, topic_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [v.id, topicId]);
  } else {
    await pool().query(`DELETE FROM saved_topics WHERE user_id = $1 AND topic_id = $2`, [v.id, topicId]);
  }
  return null;
}

export async function isSaved(userId: string | undefined, topicId: string): Promise<boolean> {
  if (!userId) return false;
  return Boolean((await pool().query(`SELECT 1 FROM saved_topics WHERE user_id = $1 AND topic_id = $2`, [userId, topicId])).rowCount);
}

// ---------------------------------------------------------------------------
// Reactions

export interface ReactionCount {
  emoji: Reaction;
  n: number;
  mine: boolean;
}

export async function setReaction(v: Viewer, postId: string, emoji: unknown, on: boolean): Promise<string | null> {
  if (!isReaction(emoji)) return "Pick one of the reactions.";
  if (v.bannedUntil != null) return "A moderator has paused your account.";
  if (on) {
    const post = await pool().query<{ user_id: string }>(`SELECT user_id FROM forum_posts WHERE id = $1 AND status = 'visible'`, [postId]);
    if (!post.rows[0]) return "That post is gone.";
    await pool().query(`INSERT INTO post_reactions (post_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [postId, v.id, emoji]);
  } else {
    await pool().query(`DELETE FROM post_reactions WHERE post_id = $1 AND user_id = $2 AND emoji = $3`, [postId, v.id, emoji]);
  }
  return null;
}

/** Reaction counts per post, in the fixed emoji order, and which the viewer added. */
export async function reactionsFor(postIds: string[], viewerId: string | undefined): Promise<Record<string, ReactionCount[]>> {
  const out: Record<string, ReactionCount[]> = {};
  if (postIds.length === 0) return out;
  const res = await pool().query<{ post_id: string; emoji: Reaction; n: number; mine: boolean }>(
    `SELECT post_id::text, emoji, count(*)::int AS n, bool_or(user_id = $2) AS mine
     FROM post_reactions WHERE post_id = ANY($1::bigint[]) GROUP BY post_id, emoji`,
    [postIds, viewerId ?? ""],
  );
  const order = Object.keys(REACTIONS) as Reaction[];
  for (const r of res.rows) (out[r.post_id] ??= []).push({ emoji: r.emoji, n: r.n, mine: r.mine });
  for (const list of Object.values(out)) list.sort((a, b) => order.indexOf(a.emoji) - order.indexOf(b.emoji));
  return out;
}

// ---------------------------------------------------------------------------
// Polls

export interface Poll {
  options: { text: string; votes: number; share: number }[];
  total: number;
  closesAt: number;
  closed: boolean;
  /** The viewer's choice, or null. */
  mine: number | null;
}

/** Validates and stores a topic's poll, inside the topic's own transaction. */
export async function insertPoll(db: Pick<PoolClient, "query">, topicId: string, options: string[], hours: number): Promise<void> {
  await db.query(`INSERT INTO polls (topic_id, options, closes_at) VALUES ($1, $2, now() + $3 * interval '1 hour')`, [topicId, options, hours]);
}


export async function getPoll(topicId: string, viewerId: string | undefined): Promise<Poll | null> {
  const res = await pool().query<{ options: string[]; closes_at: Date; counts: number[] | null; mine: number | null }>(
    `SELECT p.options, p.closes_at,
       (SELECT array_agg(COALESCE(c.n, 0) ORDER BY i) FROM generate_subscripts(p.options, 1) i
          LEFT JOIN (SELECT choice, count(*)::int AS n FROM poll_votes WHERE topic_id = p.topic_id GROUP BY choice) c ON c.choice = i - 1) AS counts,
       (SELECT choice FROM poll_votes WHERE topic_id = p.topic_id AND user_id = $2) AS mine
     FROM polls p WHERE p.topic_id = $1`,
    [topicId, viewerId ?? ""],
  );
  const r = res.rows[0];
  if (!r) return null;
  const counts = r.counts ?? r.options.map(() => 0);
  const shares = pollShares(counts);
  return {
    options: r.options.map((text, i) => ({ text, votes: counts[i] ?? 0, share: shares[i] ?? 0 })),
    total: counts.reduce((s, n) => s + n, 0),
    closesAt: r.closes_at.getTime(),
    closed: r.closes_at.getTime() <= Date.now(),
    mine: r.mine,
  };
}

/** One vote per member; they can change it until the poll closes. */
export async function votePoll(v: Viewer, topicId: string, choice: number): Promise<string | null> {
  if (v.bannedUntil != null) return "A moderator has paused your account.";
  const res = await pool().query<{ n: number; open: boolean; author: string }>(
    `SELECT cardinality(p.options) AS n, p.closes_at > now() AS open, t.user_id AS author
     FROM polls p JOIN forum_topics t ON t.id = p.topic_id WHERE p.topic_id = $1 AND t.status = 'visible'`,
    [topicId],
  );
  const p = res.rows[0];
  if (!p) return "That poll is gone.";
  if (!p.open) return "This poll has closed.";
  if (!Number.isInteger(choice) || choice < 0 || choice >= p.n) return "Pick one of the options.";
  await pool().query(
    `INSERT INTO poll_votes (topic_id, user_id, choice) VALUES ($1, $2, $3)
     ON CONFLICT (topic_id, user_id) DO UPDATE SET choice = EXCLUDED.choice, created_at = now()`,
    [topicId, v.id, choice],
  );
  return null;
}

// ---------------------------------------------------------------------------
// Views

/** Counts a topic view, once an hour per reader (member id or IP). */
export async function countView(topicId: string, reader: string | null): Promise<void> {
  if (!reader) return;
  try {
    const first = await redis().set(`views:${topicId}:${reader}`, "1", "EX", 3600, "NX");
    if (first !== "OK") return;
  } catch {
    return;
  }
  await pool().query(`UPDATE forum_topics SET views = views + 1 WHERE id = $1`, [topicId]);
}

// ---------------------------------------------------------------------------
// Trending and leaders

export interface TrendingTicker {
  symbol: string;
  href: string;
  /** Different members who tagged it. */
  people: number;
  posts: number;
}

/** The $TICKERs most members tagged in visible posts over the last day. */
export async function trendingTickers(limit = 10): Promise<TrendingTicker[]> {
  return cached(`trending:${limit}`, 5 * 60_000, async () => {
    const res = await pool().query<{ symbol: string; people: number; posts: number }>(
      `SELECT upper(m[2]) AS symbol, count(DISTINCT p.user_id)::int AS people, count(DISTINCT p.id)::int AS posts
       FROM forum_posts p
       JOIN forum_topics t ON t.id = p.topic_id
       CROSS JOIN LATERAL regexp_matches(p.body, '(^|[^A-Za-z0-9_$])\\$([A-Za-z][A-Za-z0-9]{0,9})', 'g') m
       WHERE p.status = 'visible' AND t.status = 'visible' AND p.created_at > now() - interval '1 day'
       GROUP BY 1 ORDER BY people DESC, posts DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({ ...r, href: tickerPath(r.symbol) }));
  });
}

export interface Leader {
  id: string;
  name: string;
  avatar: string | null;
  points: number;
}

/** Members whose posts got the most net upvotes from others this week. */
export async function weeklyLeaders(limit = 10): Promise<Leader[]> {
  return cached(`leaders:${limit}`, 10 * 60_000, async () => {
    const res = await pool().query<{ id: string; chat_name: string; avatar_id: string | null; mime: MediaType | null; points: number }>(
      `SELECT u.id, u.chat_name, u.avatar_id, (SELECT m.mime FROM media m WHERE m.id = u.avatar_id AND m.status = 'visible') AS mime,
         sum(v.value)::int AS points
       FROM forum_votes v JOIN forum_posts p ON p.id = v.post_id JOIN "user" u ON u.id = p.user_id
       WHERE v.created_at > now() - interval '7 days' AND p.status = 'visible' AND v.user_id <> p.user_id
         AND NOT u.is_bot AND u.chat_name IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM chat_bans b WHERE b.user_id = u.id AND (b.until IS NULL OR b.until > now()))
       GROUP BY u.id HAVING sum(v.value) > 0 ORDER BY points DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.chat_name,
      avatar: r.avatar_id && r.mime ? mediaUrl(r.avatar_id, r.mime) : null,
      points: r.points,
    }));
  });
}

// ---------------------------------------------------------------------------
// Profile extras

export interface ProfileExtras {
  banner: string | null;
  followers: number;
  following: number;
  /** Whether the viewer follows them. */
  followed: boolean;
  /** Whether the viewer muted them. */
  muted: boolean;
  badges: Badge[];
}

export async function profileExtras(
  p: { id: string; joined: number; topics: number; replies: number; scoreReceived: number; verified: boolean },
  viewerId: string | undefined,
): Promise<ProfileExtras> {
  const res = await pool().query<{
    banner_id: string | null;
    mime: MediaType | null;
    followers: number;
    following: number;
    followed: boolean;
    muted: boolean;
    member_no: number;
    polls: number;
  }>(
    `SELECT u.banner_id, (SELECT m.mime FROM media m WHERE m.id = u.banner_id AND m.status = 'visible') AS mime,
       (SELECT count(*)::int FROM follows WHERE followee_id = u.id) AS followers,
       (SELECT count(*)::int FROM follows WHERE follower_id = u.id) AS following,
       EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id) AS followed,
       EXISTS (SELECT 1 FROM chat_mutes WHERE user_id = $2 AND muted_user_id = u.id) AS muted,
       (SELECT count(*)::int FROM "user" o WHERE o."createdAt" <= u."createdAt" AND NOT o.is_bot) AS member_no,
       (SELECT count(*)::int FROM polls pl JOIN forum_topics t ON t.id = pl.topic_id WHERE t.user_id = u.id AND t.status = 'visible') AS polls
     FROM "user" u WHERE u.id = $1`,
    [p.id, viewerId ?? ""],
  );
  const r = res.rows[0]!;
  return {
    banner: r.banner_id && r.mime ? mediaUrl(r.banner_id, r.mime) : null,
    followers: r.followers,
    following: r.following,
    followed: r.followed,
    muted: r.muted,
    badges: badgesFor({
      createdAt: p.joined,
      topics: p.topics,
      replies: p.replies,
      scoreReceived: p.scoreReceived,
      followers: r.followers,
      verified: p.verified,
      memberNo: r.member_no,
      polls: r.polls,
    }),
  };
}
