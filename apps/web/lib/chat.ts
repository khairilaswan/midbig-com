import "server-only";
import { createHash } from "node:crypto";
import {
  badgeFor,
  CHAT_CHANNEL,
  CHAT_LIMITS,
  CHAT_PAGE_SIZE,
  chatNameProblem,
  checkMessage,
  cleanBody,
  parseRoom,
  type ChatEvent,
  type ChatMessage,
  type ChatRole,
  type FilterReason,
  type ReportReason,
} from "@midbig/shared";
import { turnstile } from "./auth";
import { pool, redis } from "./server";
import type { PostBlock } from "./types";

/** Accounts with these emails are admins (comma separated, from ADMIN_EMAILS). */
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export interface Viewer {
  id: string;
  email: string;
  role: ChatRole;
  chatName: string | null;
  createdAt: number;
  twoFactor: boolean;
  /** ms since epoch, Infinity for a permanent ban, null when not banned. */
  bannedUntil: number | null;
  isStaff: boolean;
  reputation: number;
}

export async function getViewer(userId: string): Promise<Viewer | null> {
  const res = await pool().query<{
    id: string;
    email: string;
    role: ChatRole;
    chat_name: string | null;
    createdAt: Date;
    twoFactorEnabled: boolean | null;
    reputation: number;
    banned: boolean;
    until: Date | null;
  }>(
    `SELECT u.id, u.email, u.role, u.chat_name, u."createdAt", u."twoFactorEnabled", u.reputation,
            b.user_id IS NOT NULL AS banned, b.until
     FROM "user" u LEFT JOIN chat_bans b ON b.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const r = res.rows[0];
  if (!r) return null;
  let role = r.role;
  if (ADMIN_EMAILS.has(r.email.toLowerCase()) && role !== "admin") {
    await pool().query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [r.id]);
    role = "admin";
  }
  const until = r.until ? r.until.getTime() : Infinity;
  return {
    id: r.id,
    email: r.email,
    role,
    chatName: r.chat_name,
    createdAt: r.createdAt.getTime(),
    twoFactor: Boolean(r.twoFactorEnabled),
    bannedUntil: r.banned && until > Date.now() ? until : null,
    isStaff: role !== "user",
    reputation: r.reputation,
  };
}

/** Moderator tools need a staff role and two-factor login, as the plan requires. */
export function canModerate(v: Viewer | null): v is Viewer {
  return v != null && v.isStaff && v.twoFactor;
}

/** Why this person can't post yet, or null when they can. */
export function postBlock(v: Viewer | null, now = Date.now()): PostBlock | null {
  if (!v) return { reason: "login" };
  if (v.bannedUntil != null) return { reason: "banned", until: Number.isFinite(v.bannedUntil) ? v.bannedUntil : null };
  if (!v.isStaff && now - v.createdAt < CHAT_LIMITS.readOnlyMs) {
    return { reason: "new", until: v.createdAt + CHAT_LIMITS.readOnlyMs };
  }
  if (!v.chatName) return { reason: "name" };
  return null;
}

interface MessageRecord {
  id: string;
  room: string;
  user_id: string;
  chat_name: string | null;
  role: ChatRole;
  body: string;
  created_at: Date;
  status: "visible" | "held" | "removed";
}

const MESSAGE_SELECT = `SELECT m.id::text, m.room, m.user_id, u.chat_name, u.role, m.body, m.created_at, m.status
  FROM chat_messages m JOIN "user" u ON u.id = m.user_id`;

function toMessage(r: MessageRecord): ChatMessage {
  return {
    id: r.id,
    room: r.room,
    userId: r.user_id,
    name: r.chat_name ?? "member",
    badge: badgeFor(r.role),
    body: r.body,
    at: r.created_at.getTime(),
    ...(r.status === "held" ? { held: true } : {}),
  };
}

/**
 * A page of a room's messages, oldest first: the latest ones, or those
 * before or after a message id. Held messages are included for their author.
 */
export async function loadMessages(
  room: string,
  opts: { before?: string; after?: string; viewerId?: string },
): Promise<ChatMessage[]> {
  const before = opts.before && /^\d{1,18}$/.test(opts.before) ? opts.before : null;
  const after = opts.after && /^\d{1,18}$/.test(opts.after) ? opts.after : null;
  const res = await pool().query<MessageRecord>(
    `${MESSAGE_SELECT}
     WHERE m.room = $1 AND (m.status = 'visible' OR (m.status = 'held' AND m.user_id = $2))
       AND ($3::bigint IS NULL OR m.id < $3) AND ($4::bigint IS NULL OR m.id > $4)
     ORDER BY m.id ${after ? "ASC" : "DESC"} LIMIT $5`,
    [room, opts.viewerId ?? "", before, after, CHAT_PAGE_SIZE],
  );
  const rows = res.rows.map(toMessage);
  return after ? rows : rows.reverse();
}

export async function mutedIds(userId: string): Promise<string[]> {
  const res = await pool().query<{ muted_user_id: string }>(
    `SELECT muted_user_id FROM chat_mutes WHERE user_id = $1`,
    [userId],
  );
  return res.rows.map((r) => r.muted_user_id);
}

async function staffNames(exceptUserId: string): Promise<string[]> {
  const res = await pool().query<{ chat_name: string }>(
    `SELECT chat_name FROM "user" WHERE role <> 'user' AND chat_name IS NOT NULL AND id <> $1`,
    [exceptUserId],
  );
  return res.rows.map((r) => r.chat_name);
}

function publish(ev: ChatEvent): Promise<unknown> {
  return redis()
    .publish(CHAT_CHANNEL, JSON.stringify(ev))
    .catch((err) => console.error("chat publish failed", err));
}

async function publishRemovals(rows: { id: string; room: string }[]): Promise<void> {
  const byRoom = new Map<string, string[]>();
  for (const r of rows) byRoom.set(r.room, [...(byRoom.get(r.room) ?? []), r.id]);
  await Promise.all([...byRoom].map(([room, ids]) => publish({ type: "chat-remove", room, ids })));
}

export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!turnstile) return true;
  const body = new URLSearchParams({ secret: turnstile.secretKey, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch (err) {
    console.error("turnstile check failed", err);
    return false;
  }
}

export type PostResult =
  | { ok: true; msg: ChatMessage }
  | { ok: false; error: string; needCaptcha?: boolean; block?: PostBlock };

/** Checks, stores and broadcasts one message. */
export async function postMessage(
  v: Viewer | null,
  input: { room: string; body: string; captcha?: string; ip: string | null },
): Promise<PostResult> {
  const room = parseRoom(input.room);
  if (!room) return { ok: false, error: "That chat room doesn't exist." };
  const block = postBlock(v);
  if (block || !v) return { ok: false, error: "You can't post yet.", block: block ?? { reason: "login" } };
  if (room.kind === "coin") {
    const asset = await pool().query(`SELECT 1 FROM assets WHERE id = $1`, [room.assetId]);
    if (!asset.rowCount) return { ok: false, error: "That chat room doesn't exist." };
  }

  // A bot check on each member's first message, when Turnstile is set up.
  if (turnstile && !v.isStaff) {
    const before = await pool().query(`SELECT 1 FROM chat_messages WHERE user_id = $1 LIMIT 1`, [v.id]);
    if (!before.rowCount) {
      if (!input.captcha) return { ok: false, error: "Please confirm you're human first.", needCaptcha: true };
      if (!(await verifyTurnstile(input.captcha, input.ip))) {
        return { ok: false, error: "The human check didn't pass. Please try again.", needCaptcha: true };
      }
    }
  }

  const body = cleanBody(String(input.body ?? ""));
  const now = Date.now();
  const filter = checkMessage(body, {
    canPostLinks: now - v.createdAt >= CHAT_LIMITS.noLinksMs,
    isStaff: v.isStaff,
  });
  if (filter.action === "reject") return { ok: false, error: filter.message };

  const r = redis();
  try {
    const gap = await r.set(`chat:gap:${v.id}`, "1", "PX", CHAT_LIMITS.minGapMs, "NX");
    if (gap !== "OK") return { ok: false, error: "Slow down a little: one message every 3 seconds." };
    const hourKey = `chat:hour:${v.id}:${Math.floor(now / 3600_000)}`;
    const [[, count]] = (await r.multi().incr(hourKey).expire(hourKey, 3600).exec()) as [[unknown, number]];
    if (count > CHAT_LIMITS.perHour) return { ok: false, error: "You've hit the hourly message limit. Take a break." };
    const digest = createHash("sha1").update(body.toLowerCase()).digest("base64");
    const last = await r.set(`chat:last:${v.id}`, digest, "PX", 120_000, "GET");
    if (last === digest) return { ok: false, error: "You just posted that." };
  } catch (err) {
    // Without Redis the message can't be broadcast anyway.
    console.error("chat rate limit check failed", err);
    return { ok: false, error: "Chat is having trouble right now. Please try again shortly." };
  }

  const held = filter.action === "hold";
  const res = await pool().query<{ id: string; created_at: Date }>(
    `INSERT INTO chat_messages (room, user_id, body, status, held_by, flags)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text, created_at`,
    [input.room, v.id, body, held ? "held" : "visible", held ? "filter" : null, held ? filter.reasons : []],
  );
  const msg: ChatMessage = toMessage({
    id: res.rows[0]!.id,
    room: input.room,
    user_id: v.id,
    chat_name: v.chatName,
    role: v.role,
    body,
    created_at: res.rows[0]!.created_at,
    status: held ? "held" : "visible",
  });
  if (!held) await publish({ type: "chat", room: input.room, msg });
  return { ok: true, msg };
}

export async function setChatName(v: Viewer, raw: string): Promise<string | null> {
  const name = raw.trim();
  const problem = chatNameProblem(name, await staffNames(v.id), v.isStaff);
  if (problem) return problem;
  try {
    await pool().query(`UPDATE "user" SET chat_name = $2 WHERE id = $1`, [v.id, name]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return "That name is taken. Please pick another.";
    throw err;
  }
  return null;
}

export async function deleteOwnMessage(v: Viewer, id: string): Promise<void> {
  const res = await pool().query<{ id: string; room: string }>(
    `UPDATE chat_messages SET status = 'removed', reviewed_at = now(), reviewed_by = $2
     WHERE id = $1 AND user_id = $2 AND status <> 'removed' RETURNING id::text, room`,
    [id, v.id],
  );
  await publishRemovals(res.rows);
}

export async function reportMessage(v: Viewer, id: string, reason: ReportReason): Promise<string | null> {
  if (Date.now() - v.createdAt < CHAT_LIMITS.readOnlyMs && !v.isStaff) {
    return "New accounts can report messages after their first 10 minutes.";
  }
  const msg = await pool().query<{ user_id: string }>(`SELECT user_id FROM chat_messages WHERE id = $1`, [id]);
  if (!msg.rows[0]) return "That message is gone.";
  if (msg.rows[0].user_id === v.id) return "You can't report your own message.";
  const ins = await pool().query(
    `INSERT INTO chat_reports (message_id, reporter_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [id, v.id, reason],
  );
  if (!ins.rowCount) return null;
  // Enough reports hide a message until a moderator looks, unless one already cleared it.
  const res = await pool().query<{ id: string; room: string; hidden: boolean }>(
    `UPDATE chat_messages SET report_count = report_count + 1,
       status = CASE WHEN status = 'visible' AND reviewed_at IS NULL AND report_count + 1 >= $2 THEN 'held' ELSE status END,
       held_by = CASE WHEN status = 'visible' AND reviewed_at IS NULL AND report_count + 1 >= $2 THEN 'reports' ELSE held_by END
     WHERE id = $1 RETURNING id::text, room, (held_by = 'reports' AND status = 'held') AS hidden`,
    [id, CHAT_LIMITS.reportsToHide],
  );
  const row = res.rows[0];
  if (row?.hidden) await publishRemovals([row]);
  return null;
}

export async function setMuted(v: Viewer, otherId: string, muted: boolean): Promise<void> {
  if (otherId === v.id) return;
  if (muted) {
    await pool().query(
      `INSERT INTO chat_mutes (user_id, muted_user_id) SELECT $1, id FROM "user" WHERE id = $2 ON CONFLICT DO NOTHING`,
      [v.id, otherId],
    );
  } else {
    await pool().query(`DELETE FROM chat_mutes WHERE user_id = $1 AND muted_user_id = $2`, [v.id, otherId]);
  }
}

// ---------------------------------------------------------------------------
// Moderation

export interface QueueItem extends ChatMessage {
  status: "visible" | "held";
  heldBy: "filter" | "reports" | null;
  flags: FilterReason[];
  reports: { reason: ReportReason; n: number }[];
  authorJoined: number;
  authorMessages: number;
}

/** Held messages and reported ones no moderator has looked at yet, oldest first. */
export async function moderationQueue(): Promise<QueueItem[]> {
  const res = await pool().query<
    MessageRecord & {
      held_by: "filter" | "reports" | null;
      flags: FilterReason[];
      reports: { reason: ReportReason; n: number }[] | null;
      author_joined: Date;
      author_messages: number;
    }
  >(
    `SELECT m.id::text, m.room, m.user_id, u.chat_name, u.role, m.body, m.created_at, m.status, m.held_by, m.flags,
            u."createdAt" AS author_joined,
            (SELECT count(*)::int FROM chat_messages x WHERE x.user_id = m.user_id) AS author_messages,
            (SELECT json_agg(json_build_object('reason', reason, 'n', n)) FROM
               (SELECT reason, count(*)::int AS n FROM chat_reports r WHERE r.message_id = m.id GROUP BY reason) g) AS reports
     FROM chat_messages m JOIN "user" u ON u.id = m.user_id
     WHERE m.status = 'held' OR (m.status = 'visible' AND m.report_count > 0 AND m.reviewed_at IS NULL)
     ORDER BY m.id LIMIT 200`,
  );
  return res.rows.map((r) => ({
    ...toMessage(r),
    status: r.status === "held" ? "held" : "visible",
    heldBy: r.held_by,
    flags: r.flags,
    reports: r.reports ?? [],
    authorJoined: r.author_joined.getTime(),
    authorMessages: r.author_messages,
  }));
}

/** Shows held messages and clears reports on visible ones. */
export async function approveMessages(mod: Viewer, ids: string[]): Promise<void> {
  const res = await pool().query<MessageRecord & { was_held: boolean }>(
    `WITH prev AS (SELECT id, status FROM chat_messages WHERE id = ANY($1::bigint[]) AND status <> 'removed' FOR UPDATE)
     UPDATE chat_messages m SET status = 'visible', reviewed_at = now(), reviewed_by = $2
     FROM prev, "user" u WHERE m.id = prev.id AND u.id = m.user_id
     RETURNING m.id::text, m.room, m.user_id, u.chat_name, u.role, m.body, m.created_at, m.status, prev.status = 'held' AS was_held`,
    [ids, mod.id],
  );
  await Promise.all(
    res.rows.filter((r) => r.was_held).map((r) => publish({ type: "chat", room: r.room, msg: toMessage(r) })),
  );
}

export async function removeMessages(mod: Viewer, ids: string[]): Promise<void> {
  const res = await pool().query<{ id: string; room: string }>(
    `UPDATE chat_messages SET status = 'removed', reviewed_at = now(), reviewed_by = $2
     WHERE id = ANY($1::bigint[]) AND status <> 'removed' RETURNING id::text, room`,
    [ids, mod.id],
  );
  await publishRemovals(res.rows);
}

/**
 * Bans someone from chat (hours null = for good) and removes what they
 * posted in the last day, which is usually the spam wave that got them banned.
 */
export async function banUser(mod: Viewer, userId: string, hours: number | null, reason: string): Promise<string | null> {
  const target = await pool().query<{ role: ChatRole }>(`SELECT role FROM "user" WHERE id = $1`, [userId]);
  if (!target.rows[0]) return "That account no longer exists.";
  if (target.rows[0].role !== "user") return "Staff can't be banned. Remove their role first.";
  await pool().query(
    `INSERT INTO chat_bans (user_id, until, reason, banned_by)
     VALUES ($1, CASE WHEN $2::float8 IS NULL THEN NULL ELSE now() + $2::float8 * interval '1 hour' END, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason,
       banned_by = EXCLUDED.banned_by, created_at = now()`,
    [userId, hours, reason.slice(0, 200) || null, mod.id],
  );
  const res = await pool().query<{ id: string; room: string }>(
    `UPDATE chat_messages SET status = 'removed', reviewed_at = now(), reviewed_by = $2
     WHERE user_id = $1 AND status <> 'removed' AND created_at > now() - interval '1 day' RETURNING id::text, room`,
    [userId, mod.id],
  );
  await publishRemovals(res.rows);
  return null;
}

export async function unbanUser(userId: string): Promise<void> {
  await pool().query(`DELETE FROM chat_bans WHERE user_id = $1`, [userId]);
}

export async function listBans(): Promise<{ userId: string; name: string; until: number | null; reason: string | null }[]> {
  const res = await pool().query<{ user_id: string; chat_name: string | null; email: string; until: Date | null; reason: string | null }>(
    `SELECT b.user_id, u.chat_name, u.email, b.until, b.reason FROM chat_bans b JOIN "user" u ON u.id = b.user_id
     WHERE b.until IS NULL OR b.until > now() ORDER BY b.created_at DESC LIMIT 200`,
  );
  return res.rows.map((r) => ({
    userId: r.user_id,
    name: r.chat_name ?? r.email,
    until: r.until ? r.until.getTime() : null,
    reason: r.reason,
  }));
}

export async function listStaff(): Promise<{ id: string; email: string; name: string | null; role: ChatRole; twoFactor: boolean }[]> {
  const res = await pool().query<{ id: string; email: string; chat_name: string | null; role: ChatRole; twoFactorEnabled: boolean | null }>(
    `SELECT id, email, chat_name, role, "twoFactorEnabled" FROM "user" WHERE role <> 'user' ORDER BY role, email`,
  );
  return res.rows.map((r) => ({ id: r.id, email: r.email, name: r.chat_name, role: r.role, twoFactor: Boolean(r.twoFactorEnabled) }));
}

/** Admins only: makes someone a moderator (by email or chat name) or takes the role away. */
export async function setModerator(who: string, moderator: boolean): Promise<string | null> {
  const key = who.trim();
  if (!key) return "Enter an email or chat name.";
  const res = await pool().query<{ id: string; email: string; role: ChatRole }>(
    `SELECT id, email, role FROM "user" WHERE lower(email) = lower($1) OR lower(chat_name) = lower($1) LIMIT 1`,
    [key],
  );
  const u = res.rows[0];
  if (!u) return "No account has that email or chat name.";
  if (u.role === "admin" || ADMIN_EMAILS.has(u.email.toLowerCase())) return "That account is an admin.";
  await pool().query(`UPDATE "user" SET role = $2 WHERE id = $1`, [u.id, moderator ? "moderator" : "user"]);
  if (moderator) await pool().query(`DELETE FROM chat_bans WHERE user_id = $1`, [u.id]);
  return null;
}

/**
 * The Phase 3 gate is "most spam caught before users report it": of the
 * messages moderators removed in the last week, how many the filter held
 * versus how many people had to report first.
 */
export async function moderationStats(): Promise<{ caughtByFilter: number; reportedFirst: number; heldWaiting: number }> {
  const res = await pool().query<{ caught: number; reported: number; waiting: number }>(
    `SELECT
       count(*) FILTER (WHERE status = 'removed' AND held_by = 'filter' AND report_count = 0
                         AND reviewed_by IS DISTINCT FROM user_id)::int AS caught,
       count(*) FILTER (WHERE status = 'removed' AND report_count > 0 AND reviewed_by IS DISTINCT FROM user_id)::int AS reported,
       count(*) FILTER (WHERE status = 'held')::int AS waiting
     FROM chat_messages WHERE created_at > now() - interval '7 days'`,
  );
  const r = res.rows[0]!;
  return { caughtByFilter: r.caught, reportedFirst: r.reported, heldWaiting: r.waiting };
}
