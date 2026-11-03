import "server-only";
import { badgeFor, mediaUrl, repLevel, type ChatBadge, type MediaType } from "@midbig/shared";
import { getCommunity } from "./communities";
import { cached, pool } from "./server";
import { classEnabled } from "./settings";

/** What the small popup shows when someone hovers a member's name. */
export interface UserCard {
  kind: "user";
  name: string;
  path: string;
  avatar: string | null;
  badge: ChatBadge;
  verified: boolean;
  reputation: number;
  level: string;
  joined: number;
  posts: number;
  bio: string | null;
}

/** What the small popup shows when someone hovers a community's name. */
export interface CommunityCard {
  kind: "community";
  label: string;
  path: string;
  title: string;
  image: string | null;
  description: string | null;
  members: number;
  posts: number;
  asset: boolean;
}

export type HoverCard = UserCard | CommunityCard;

const clip = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function userCard(name: string): Promise<UserCard | null> {
  return cached(`card:u:${name.toLowerCase()}`, 30_000, async () => {
    const res = await pool().query<{
      chat_name: string;
      role: Parameters<typeof badgeFor>[0];
      is_bot: boolean;
      verified: boolean;
      reputation: number;
      avatar_id: string | null;
      avatar_mime: MediaType | null;
      bio: string | null;
      createdAt: Date;
      posts: number;
    }>(
      `SELECT u.chat_name, u.role, u.is_bot, u.verified, u.reputation, u.avatar_id, u.bio, u."createdAt",
         (SELECT am.mime FROM media am WHERE am.id = u.avatar_id AND am.status = 'visible') AS avatar_mime,
         (SELECT count(*)::int FROM forum_posts p WHERE p.user_id = u.id AND p.status = 'visible') AS posts
       FROM "user" u WHERE lower(u.chat_name) = lower($1)`,
      [name],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      kind: "user",
      name: r.chat_name,
      path: `/u/${encodeURIComponent(r.chat_name)}`,
      avatar: r.avatar_id && r.avatar_mime ? mediaUrl(r.avatar_id, r.avatar_mime) : null,
      badge: badgeFor(r.role, r.is_bot),
      verified: r.verified,
      reputation: r.reputation,
      level: repLevel(r.reputation),
      joined: r.createdAt.getTime(),
      posts: r.posts,
      bio: clip(r.bio, 160),
    };
  });
}

/** "b/bitcoin" or "m/pepe". Suspended communities, and ones in a switched-off category, get no card. */
export async function communityCard(label: string): Promise<CommunityCard | null> {
  const m = /^([bm])\/([A-Za-z0-9-]{1,60})$/.exec(label);
  if (!m) return null;
  const c = await getCommunity(m[1] as "b" | "m", m[2]!);
  if (!c || c.status !== "active" || !(await classEnabled(c.assetClass))) return null;
  return {
    kind: "community",
    label: c.label,
    path: c.path,
    title: c.title,
    image: c.image,
    description: clip(c.description, 200),
    members: c.memberCount,
    posts: c.topicCount,
    asset: c.kind === "asset",
  };
}
