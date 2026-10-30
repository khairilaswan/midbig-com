import "server-only";
import { randomUUID } from "node:crypto";
import { CHAT_NAME_RULE, cleanBody, isBotKind, type AssetClass, type BotKind, type ChatRole } from "@midbig/shared";
import { type Viewer } from "./chat";
import { forgetBots } from "./bots";
import { logAction } from "./communities";
import { pool, uncache } from "./server";
import { categories, type Categories } from "./settings";

/** The admin portal needs the admin role and two-factor login, like moderation. */
export function isAdmin(v: Viewer | null): v is Viewer {
  return v != null && v.role === "admin" && v.twoFactor;
}

export async function setCategories(admin: Viewer, next: Partial<Categories>): Promise<void> {
  const value = { ...(await categories()), ...next };
  await pool().query(
    `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('categories', $1, now(), $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [value, admin.id],
  );
  uncache("settings:");
  uncache("market:");
  uncache("movers:");
  await logAction(admin, "categories.set", null, value);
}

export interface Overview {
  members: number;
  newMembers7d: number;
  verified: number;
  communities: { b: number; m: number; suspended: number };
  topics24h: number;
  comments24h: number;
  chat24h: number;
  queue: { chat: number; forum: number };
  botReplies24h: number;
  /** Topics in the last week by category (hubs with no category count as "general"). */
  byClass: Record<AssetClass | "general", number>;
}

export async function overview(): Promise<Overview> {
  const r = (
    await pool().query<{
      members: number;
      new7: number;
      verified: number;
      b: number;
      m: number;
      suspended: number;
      topics: number;
      comments: number;
      chat: number;
      qchat: number;
      qforum: number;
      bots: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM "user" WHERE NOT is_bot) AS members,
         (SELECT count(*)::int FROM "user" WHERE NOT is_bot AND "createdAt" > now() - interval '7 days') AS new7,
         (SELECT count(*)::int FROM "user" WHERE verified) AS verified,
         (SELECT count(*)::int FROM communities WHERE ns = 'b' AND status = 'active') AS b,
         (SELECT count(*)::int FROM communities WHERE ns = 'm' AND status = 'active') AS m,
         (SELECT count(*)::int FROM communities WHERE status = 'suspended') AS suspended,
         (SELECT count(*)::int FROM forum_topics WHERE created_at > now() - interval '1 day') AS topics,
         (SELECT count(*)::int FROM forum_posts WHERE NOT is_first AND created_at > now() - interval '1 day') AS comments,
         (SELECT count(*)::int FROM chat_messages WHERE created_at > now() - interval '1 day') AS chat,
         (SELECT count(*)::int FROM chat_messages WHERE status = 'held' OR (status = 'visible' AND report_count > 0 AND reviewed_at IS NULL)) AS qchat,
         (SELECT count(*)::int FROM forum_posts WHERE status = 'held' OR (status = 'visible' AND report_count > 0 AND reviewed_at IS NULL)) AS qforum,
         (SELECT count(*)::int FROM bot_replies WHERE created_at > now() - interval '1 day') AS bots`,
    )
  ).rows[0]!;
  const by = await pool().query<{ cls: string; n: number }>(
    `SELECT COALESCE(c.asset_class, 'general') AS cls, count(*)::int AS n FROM forum_topics t JOIN communities c ON c.id = t.community_id
     WHERE t.created_at > now() - interval '7 days' GROUP BY 1`,
  );
  const byClass = { crypto: 0, stock: 0, forex: 0, general: 0 };
  for (const row of by.rows) if (row.cls in byClass) byClass[row.cls as keyof typeof byClass] = row.n;
  return {
    members: r.members,
    newMembers7d: r.new7,
    verified: r.verified,
    communities: { b: r.b, m: r.m, suspended: r.suspended },
    topics24h: r.topics,
    comments24h: r.comments,
    chat24h: r.chat,
    queue: { chat: r.qchat, forum: r.qforum },
    botReplies24h: r.bots,
    byClass,
  };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: ChatRole;
  verified: boolean;
  reputation: number;
  joined: number;
  banned: boolean;
  posts: number;
  communities: number;
}

/** Members by email or public name (start of either), newest first when no search. */
export async function searchUsers(q: string): Promise<AdminUser[]> {
  const term = q.trim().slice(0, 100);
  const like = term ? term.replace(/[\\%_]/g, (c) => "\\" + c) + "%" : null;
  const res = await pool().query<{
    id: string;
    email: string;
    chat_name: string | null;
    role: ChatRole;
    verified: boolean;
    reputation: number;
    createdAt: Date;
    banned: boolean;
    posts: number;
    communities: number;
  }>(
    `SELECT u.id, u.email, u.chat_name, u.role, u.verified, u.reputation, u."createdAt",
       EXISTS (SELECT 1 FROM chat_bans b WHERE b.user_id = u.id AND (b.until IS NULL OR b.until > now())) AS banned,
       (SELECT count(*)::int FROM forum_posts p WHERE p.user_id = u.id) AS posts,
       (SELECT count(*)::int FROM communities c WHERE c.created_by = u.id) AS communities
     FROM "user" u
     WHERE NOT u.is_bot AND ($1::text IS NULL OR u.email ILIKE $1 OR u.chat_name ILIKE $1)
     ORDER BY u."createdAt" DESC LIMIT 50`,
    [like],
  );
  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.chat_name,
    role: r.role,
    verified: r.verified,
    reputation: r.reputation,
    joined: r.createdAt.getTime(),
    banned: r.banned,
    posts: r.posts,
    communities: r.communities,
  }));
}

export async function setVerified(admin: Viewer, userId: string, verified: boolean): Promise<string | null> {
  const res = await pool().query<{ email: string }>(
    `UPDATE "user" SET verified = $2 WHERE id = $1 AND NOT is_bot RETURNING email`,
    [userId, verified],
  );
  if (!res.rows[0]) return "That account no longer exists.";
  await logAction(admin, verified ? "user.verify" : "user.unverify", res.rows[0].email);
  return null;
}

// ---------------------------------------------------------------------------
// Bots

const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;

export interface BotInput {
  handle?: string;
  kind?: string;
  description: string;
  persona?: string;
  dailyCap: number;
  enabled?: boolean;
}

function botFields(input: BotInput): { description: string; persona: string | null; dailyCap: number } | string {
  const description = cleanBody(String(input.description ?? "")).slice(0, 200).trim();
  if (!description) return "Say what the bot does; members see it on its profile.";
  const persona = cleanBody(String(input.persona ?? "")).slice(0, 1000).trim() || null;
  const dailyCap = Math.floor(Number(input.dailyCap));
  if (!(dailyCap >= 0 && dailyCap <= 100000)) return "The daily limit must be between 0 and 100,000.";
  return { description, persona, dailyCap };
}

/** A bot is a user row that can't log in (no password, an unroutable email) plus its settings. */
export async function createBot(admin: Viewer, input: BotInput): Promise<string | null> {
  const handle = String(input.handle ?? "").trim();
  if (!HANDLE_RE.test(handle)) return `Use ${CHAT_NAME_RULE} for the handle.`;
  if (!/bot$/i.test(handle)) return "End the handle in \"bot\" so members can tell it's a bot.";
  const kind = String(input.kind ?? "");
  if (!isBotKind(kind)) return "Pick what the bot does.";
  const f = botFields(input);
  if (typeof f === "string") return f;
  const id = `bot-${randomUUID()}`;
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", chat_name, is_bot, bio) VALUES ($1, $2, $3, true, $2, true, $4)`,
      [id, handle, `${id}@bots.midbig.invalid`, f.description.slice(0, 160)],
    );
    await client.query(
      `INSERT INTO bots (user_id, handle, kind, description, persona, daily_cap, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, handle, kind as BotKind, f.description, f.persona, f.dailyCap, admin.id],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if ((err as { code?: string }).code === "23505") return "That handle is taken.";
    throw err;
  } finally {
    client.release();
  }
  forgetBots();
  await logAction(admin, "bot.create", handle, { kind });
  return null;
}

export async function updateBot(admin: Viewer, userId: string, input: BotInput): Promise<string | null> {
  const f = botFields(input);
  if (typeof f === "string") return f;
  const res = await pool().query<{ handle: string }>(
    `UPDATE bots SET description = $2, persona = $3, daily_cap = $4, enabled = $5 WHERE user_id = $1 RETURNING handle`,
    [userId, f.description, f.persona, f.dailyCap, Boolean(input.enabled)],
  );
  if (!res.rows[0]) return "That bot is gone.";
  await pool().query(`UPDATE "user" SET bio = $2 WHERE id = $1`, [userId, f.description.slice(0, 160)]);
  forgetBots();
  await logAction(admin, "bot.edit", res.rows[0].handle, { enabled: Boolean(input.enabled), dailyCap: f.dailyCap });
  return null;
}

export async function botActivity(): Promise<Record<string, { day: number; week: number }>> {
  const res = await pool().query<{ bot_id: string; day: number; week: number }>(
    `SELECT bot_id, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS day, count(*)::int AS week
     FROM bot_replies WHERE created_at > now() - interval '7 days' GROUP BY bot_id`,
  );
  return Object.fromEntries(res.rows.map((r) => [r.bot_id, { day: r.day, week: r.week }]));
}

// ---------------------------------------------------------------------------
// Log

export interface LogEntry {
  id: string;
  actor: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  at: number;
}

export async function adminLog(limit = 200): Promise<LogEntry[]> {
  const res = await pool().query<{
    id: string;
    actor: string | null;
    action: string;
    target: string | null;
    detail: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT l.id::text, COALESCE(u.chat_name, u.email) AS actor, l.action, l.target, l.detail, l.created_at
     FROM admin_log l LEFT JOIN "user" u ON u.id = l.actor_id ORDER BY l.id DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({ id: r.id, actor: r.actor, action: r.action, target: r.target, detail: r.detail, at: r.created_at.getTime() }));
}
