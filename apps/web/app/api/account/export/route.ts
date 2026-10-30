import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/server";

/** Everything stored about the signed-in person, as one JSON file (GDPR and CCPA access requests). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const id = session.user.id;
  const q = async (sql: string) => (await pool().query(sql, [id])).rows;
  const [user, logins, watchlist, transactions, alerts, devices, messages, reports, mutes, ban, topics, posts, votes, forumReports] =
    await Promise.all([
    q(`SELECT id, name, email, "emailVerified", chat_name, bio, reputation, role, "twoFactorEnabled", "createdAt", "updatedAt" FROM "user" WHERE id = $1`),
    q(`SELECT "providerId", "createdAt" FROM "account" WHERE "userId" = $1`),
    q(`SELECT asset_id, added_at FROM watchlist WHERE user_id = $1 ORDER BY added_at`),
    q(`SELECT asset_id, side, quantity, price, fee, executed_at, note, created_at FROM portfolio_txns WHERE user_id = $1 ORDER BY executed_at`),
    q(`SELECT asset_id, direction, target, notify_email, created_at, triggered_at, triggered_price FROM price_alerts WHERE user_id = $1 ORDER BY created_at`),
    q(`SELECT user_agent, created_at FROM push_subscriptions WHERE user_id = $1`),
    q(`SELECT room, body, status, created_at FROM chat_messages WHERE user_id = $1 ORDER BY id`),
    q(`SELECT message_id::text, reason, created_at FROM chat_reports WHERE reporter_id = $1`),
    q(`SELECT u.chat_name AS muted, m.created_at FROM chat_mutes m JOIN "user" u ON u.id = m.muted_user_id WHERE m.user_id = $1`),
    q(`SELECT until, reason, created_at FROM chat_bans WHERE user_id = $1`),
    q(`SELECT id::text, category, asset_id, title, status, created_at FROM forum_topics WHERE user_id = $1 ORDER BY id`),
    q(`SELECT topic_id::text, is_first, body, status, helpful_count, created_at, edited_at FROM forum_posts WHERE user_id = $1 ORDER BY id`),
    q(`SELECT post_id::text, created_at FROM forum_votes WHERE user_id = $1`),
    q(`SELECT post_id::text, reason, created_at FROM forum_reports WHERE reporter_id = $1`),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    account: user[0],
    logins,
    watchlist,
    portfolioTransactions: transactions,
    priceAlerts: alerts,
    notificationDevices: devices,
    chatMessages: messages,
    chatReports: reports,
    chatMutes: mutes,
    chatBan: ban[0] ?? null,
    forumTopics: topics,
    forumPosts: posts,
    forumHelpfulVotes: votes,
    forumReports,
  };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="midbig-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
