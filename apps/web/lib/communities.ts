import "server-only";
import {
  assetPath,
  coinRoom,
  communityLabel,
  communityPath,
  communityRoom,
  COMMUNITY_LIMITS,
  checkMessage,
  cleanBody,
  defaultSlug,
  normalizeSlug,
  slugProblem,
  type AssetClass,
  type CommunityKind,
  type Namespace,
} from "@midbig/shared";
import type { Viewer } from "./chat";
import { cached, pool, uncache } from "./server";
import { enabledClasses } from "./settings";

export interface TokenInfo {
  chain?: string;
  contract?: string;
  website?: string;
}

export interface Community {
  id: string;
  ns: Namespace;
  slug: string;
  kind: CommunityKind;
  /** "b/bitcoin", "b/AAPL", "m/pepe". */
  label: string;
  path: string;
  assetId: string | null;
  assetClass: AssetClass | null;
  title: string;
  symbol: string | null;
  image: string | null;
  description: string | null;
  rules: string | null;
  tokenInfo: TokenInfo;
  status: "active" | "suspended";
  memberCount: number;
  topicCount: number;
  lastPostAt: number | null;
  createdAt: number;
}

interface CommunityRecord {
  id: string;
  ns: Namespace;
  slug: string;
  kind: CommunityKind;
  asset_id: string | null;
  asset_class: AssetClass | null;
  title: string;
  symbol: string | null;
  image_url: string | null;
  description: string | null;
  rules: string | null;
  token_info: TokenInfo;
  status: "active" | "suspended";
  member_count: number;
  topic_count: number;
  last_post_at: Date | null;
  created_at: Date;
}

const SELECT = `SELECT c.id::text, c.ns, c.slug, c.kind, c.asset_id, c.asset_class, c.title, c.symbol, a.image_url,
    c.description, c.rules, c.token_info, c.status, c.member_count, c.topic_count, c.last_post_at, c.created_at
  FROM communities c LEFT JOIN assets a ON a.id = c.asset_id`;

function toCommunity(r: CommunityRecord): Community {
  const key = { ns: r.ns, slug: r.slug, assetClass: r.asset_class, kind: r.kind };
  return {
    id: r.id,
    ns: r.ns,
    slug: r.slug,
    kind: r.kind,
    label: communityLabel(key),
    path: communityPath(key),
    assetId: r.asset_id,
    assetClass: r.asset_class,
    title: r.title,
    symbol: r.symbol,
    image: r.image_url,
    description: r.description,
    rules: r.rules,
    tokenInfo: r.token_info ?? {},
    status: r.status,
    memberCount: r.member_count,
    topicCount: r.topic_count,
    lastPostAt: r.last_post_at?.getTime() ?? null,
    createdAt: r.created_at.getTime(),
  };
}

/** The chat room a community's Chat tab shows: an asset community shares its asset page's room. */
export function chatRoomFor(c: Pick<Community, "id" | "assetId">): string {
  return c.assetId ? coinRoom(c.assetId) : communityRoom(c.id);
}

/** A community by its name, any case. Suspended ones only for staff. */
export async function getCommunity(ns: Namespace, slug: string): Promise<Community | null> {
  const res = await pool().query<CommunityRecord>(`${SELECT} WHERE c.ns = $1 AND c.slug = lower($2)`, [ns, slug]);
  return res.rows[0] ? toCommunity(res.rows[0]) : null;
}

export async function getCommunityById(id: string): Promise<Community | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const res = await pool().query<CommunityRecord>(`${SELECT} WHERE c.id = $1`, [id]);
  return res.rows[0] ? toCommunity(res.rows[0]) : null;
}

export async function communityForAsset(assetId: string): Promise<Community | null> {
  return cached(`community:asset:${assetId}`, 30_000, async () => {
    const res = await pool().query<CommunityRecord>(`${SELECT} WHERE c.asset_id = $1 AND c.status = 'active'`, [assetId]);
    return res.rows[0] ? toCommunity(res.rows[0]) : null;
  });
}

/** Active communities whose category is switched on. */
export async function listCommunities(opts: {
  ns?: Namespace;
  q?: string;
  sort?: "members" | "active" | "new";
  limit?: number;
  offset?: number;
  includeSuspended?: boolean;
}): Promise<Community[]> {
  const classes = await enabledClasses();
  const q = opts.q?.trim().slice(0, 50) || null;
  const order =
    opts.sort === "new"
      ? "c.created_at DESC"
      : opts.sort === "active"
        ? "c.last_post_at DESC NULLS LAST, c.member_count DESC"
        : "c.kind = 'hub' DESC, c.member_count DESC, c.topic_count DESC, a.market_cap DESC NULLS LAST";
  const res = await pool().query<CommunityRecord>(
    `${SELECT}
     WHERE ($1::text IS NULL OR c.ns = $1) AND ($2 OR c.status = 'active')
       AND (c.asset_class IS NULL OR c.asset_class = ANY($3))
       AND ($4::text IS NULL OR c.slug ILIKE $4 || '%' OR c.title ILIKE $4 || '%' OR c.symbol ILIKE $4 || '%')
     ORDER BY ${order} LIMIT $5 OFFSET $6`,
    [opts.ns ?? null, Boolean(opts.includeSuspended), classes, q, opts.limit ?? 50, opts.offset ?? 0],
  );
  return res.rows.map(toCommunity);
}

/** Every active community's name, for the "post to" picker. */
export async function communityNames(): Promise<{ id: string; label: string; title: string }[]> {
  const classes = await enabledClasses();
  const res = await pool().query<CommunityRecord>(
    `${SELECT} WHERE c.status = 'active' AND (c.asset_class IS NULL OR c.asset_class = ANY($1))
     ORDER BY c.ns, c.kind = 'hub' DESC, c.member_count DESC, c.slug LIMIT 2000`,
    [classes],
  );
  return res.rows.map((r) => {
    const c = toCommunity(r);
    return { id: c.id, label: c.label, title: c.title };
  });
}

export async function joinedCommunities(userId: string): Promise<(Community & { role: "member" | "mod" })[]> {
  const classes = await enabledClasses();
  const res = await pool().query<CommunityRecord & { role: "member" | "mod" }>(
    `${SELECT.replace("FROM communities c", ", m.role FROM communities c JOIN community_members m ON m.community_id = c.id")}
     WHERE m.user_id = $1 AND c.status = 'active' AND (c.asset_class IS NULL OR c.asset_class = ANY($2))
     ORDER BY c.last_post_at DESC NULLS LAST LIMIT 200`,
    [userId, classes],
  );
  return res.rows.map((r) => ({ ...toCommunity(r), role: r.role }));
}

export async function membership(userId: string | undefined, communityId: string): Promise<"member" | "mod" | null> {
  if (!userId) return null;
  const res = await pool().query<{ role: "member" | "mod" }>(
    `SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2`,
    [communityId, userId],
  );
  return res.rows[0]?.role ?? null;
}

/** Site moderators, and a community's own moderators, with two-factor login on. */
export async function canModerateCommunity(v: Viewer | null, communityId: string): Promise<boolean> {
  if (!v) return false;
  if (v.isStaff && v.twoFactor) return true;
  return v.twoFactor && v.bannedUntil == null && (await membership(v.id, communityId)) === "mod";
}

export async function setMember(v: Viewer, communityId: string, join: boolean): Promise<string | null> {
  const c = await getCommunityById(communityId);
  if (!c || c.status !== "active") return "That community is gone.";
  if (join) {
    const ins = await pool().query(
      `INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [communityId, v.id],
    );
    if (ins.rowCount) await pool().query(`UPDATE communities SET member_count = member_count + 1 WHERE id = $1`, [communityId]);
  } else {
    // Community moderators stay members until an admin takes the role away.
    const del = await pool().query(
      `DELETE FROM community_members WHERE community_id = $1 AND user_id = $2 AND role = 'member'`,
      [communityId, v.id],
    );
    if (!del.rowCount) return (await membership(v.id, communityId)) === "mod" ? "Moderators can't leave. Ask an admin." : null;
    await pool().query(`UPDATE communities SET member_count = greatest(member_count - 1, 0) WHERE id = $1`, [communityId]);
  }
  return null;
}

/**
 * Names in use plus every listed asset's default name, which stays reserved
 * for its b/ community. `forAsset` frees that asset's own default name.
 */
async function takenSlugs(forAsset?: string | null): Promise<Set<string>> {
  const [used, assets] = await Promise.all([
    pool().query<{ slug: string }>(`SELECT slug FROM communities`),
    pool().query<{ id: string }>(`SELECT id FROM assets WHERE id IS DISTINCT FROM $1`, [forAsset ?? null]),
  ]);
  return new Set([...assets.rows.map((r) => defaultSlug(r.id)), ...used.rows.map((r) => r.slug)]);
}

function clean(raw: unknown, max: number): string | null {
  const s = cleanBody(String(raw ?? "")).slice(0, max).trim();
  return s || null;
}

/** Short texts members see on a community page: no contact details, wallet addresses or offers. */
function textProblem(text: string | null, what: string, isStaff: boolean): string | null {
  if (!text) return null;
  const r = checkMessage(text, { canPostLinks: isStaff, isStaff, maxLength: COMMUNITY_LIMITS.rulesMax });
  if (r.action === "reject") return `${what}: ${r.message}`;
  if (r.action === "hold") return `${what} can't contain links, contact details, wallet addresses or offers.`;
  return null;
}

export interface CommunityInput {
  ns: Namespace;
  slug: string;
  title: string;
  symbol?: string;
  description?: string;
  /** A listed asset this community is about. */
  assetId?: string | null;
  /** b/ only: a topic hub instead of an asset. */
  hub?: boolean;
  /** For a hub: which category switch hides it, if any. */
  hubClass?: AssetClass | null;
  tokenInfo?: TokenInfo;
}

/**
 * Admins create in b/ and m/. Verified members create in m/ only, up to
 * COMMUNITY_LIMITS.perMember, for a coin that isn't already a b/ community.
 */
export async function createCommunity(v: Viewer, input: CommunityInput): Promise<{ ok: true; path: string; id: string } | { ok: false; error: string }> {
  const admin = v.role === "admin";
  if (!admin) {
    if (input.ns !== "m") return { ok: false, error: "Only midbig can create b/ communities." };
    if (!v.verified) return { ok: false, error: "Only verified members can create communities." };
    if (v.bannedUntil != null) return { ok: false, error: "A moderator has paused your account." };
    const n = await pool().query<{ n: number }>(`SELECT count(*)::int AS n FROM communities WHERE created_by = $1`, [v.id]);
    if (n.rows[0]!.n >= COMMUNITY_LIMITS.perMember) {
      return { ok: false, error: `You can create up to ${COMMUNITY_LIMITS.perMember} communities.` };
    }
  }

  const slug = normalizeSlug(input.slug);
  const title = clean(input.title, COMMUNITY_LIMITS.titleMax);
  if (!title) return { ok: false, error: "Give it a name." };
  const description = clean(input.description, COMMUNITY_LIMITS.descriptionMax);
  const problem = textProblem(title, "The name", admin) ?? textProblem(description, "The description", admin);
  if (problem) return { ok: false, error: problem };

  let assetId: string | null = null;
  let assetClass: AssetClass | null = null;
  let symbol = clean(input.symbol, COMMUNITY_LIMITS.symbolMax)?.toUpperCase().replace(/^\$/, "") ?? null;
  let kind: CommunityKind;
  if (input.assetId) {
    const a = await pool().query<{ id: string; asset_class: AssetClass; symbol: string }>(
      `SELECT id, asset_class, symbol FROM assets WHERE id = $1`,
      [input.assetId],
    );
    const asset = a.rows[0];
    if (!asset) return { ok: false, error: "That asset wasn't found." };
    if (!admin && asset.asset_class !== "crypto") return { ok: false, error: "m/ communities are for coins and tokens." };
    assetId = asset.id;
    assetClass = asset.asset_class;
    symbol ??= asset.asset_class === "forex" ? asset.id.slice(3).replace("-", "/").toUpperCase() : asset.symbol.toUpperCase();
    kind = "asset";
  } else if (input.hub && admin && input.ns === "b") {
    kind = "hub";
    assetClass = input.hubClass ?? null;
    symbol = null;
  } else {
    kind = "token";
    assetClass = "crypto";
    if (!symbol || !/^[A-Z0-9.]{1,20}$/.test(symbol)) return { ok: false, error: "Add the token's ticker, like PEPE." };
  }
  const slugError = slugProblem(slug, await takenSlugs(assetId));
  if (slugError) return { ok: false, error: slugError };

  const tokenInfo: TokenInfo = {};
  if (kind === "token") {
    const chain = clean(input.tokenInfo?.chain, 40);
    const contract = clean(input.tokenInfo?.contract, 100);
    const website = clean(input.tokenInfo?.website, 200);
    if (contract && !/^[A-Za-z0-9:_-]{20,100}$/.test(contract)) return { ok: false, error: "That contract address doesn't look right." };
    if (website && !/^https:\/\/[^\s<>"]+$/.test(website)) return { ok: false, error: "The website must start with https://" };
    if (chain) tokenInfo.chain = chain;
    if (contract) tokenInfo.contract = contract;
    if (website) tokenInfo.website = website;
  }

  try {
    const res = await pool().query<{ id: string }>(
      `INSERT INTO communities (ns, slug, kind, asset_id, asset_class, title, symbol, description, token_info, created_by, member_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1) RETURNING id::text`,
      [input.ns, slug, kind, assetId, assetClass, title, symbol, description, tokenInfo, v.id],
    );
    const id = res.rows[0]!.id;
    // The creator joins, and moderates an m/ they made.
    await pool().query(`INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, $3)`, [
      id,
      v.id,
      input.ns === "m" && !admin ? "mod" : "member",
    ]);
    if (assetId) uncache(`community:asset:${assetId}`);
    await logAction(v, "community.create", `${input.ns}/${slug}`, { kind, assetId });
    return { ok: true, id, path: communityPath({ ns: input.ns, slug, assetClass, kind }) };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { ok: false, error: "That name or asset already has a community." };
    throw err;
  }
}

/**
 * Admin shortcut: b/ communities for the biggest coins and stocks and every
 * forex pair that doesn't have one yet. Names that clash are skipped.
 */
export async function createDefaults(admin: Viewer, counts: { crypto: number; stock: number; forex: number }): Promise<number> {
  const res = await pool().query<{ id: string; asset_class: AssetClass; name: string; symbol: string }>(
    `SELECT id, asset_class, name, symbol FROM (
       SELECT a.*, row_number() OVER (PARTITION BY asset_class ORDER BY market_cap_rank NULLS LAST, market_cap DESC NULLS LAST, id) AS n
       FROM assets a
       WHERE NOT EXISTS (SELECT 1 FROM communities c WHERE c.asset_id = a.id)
         AND (asset_class <> 'stock' OR ref_price IS NOT NULL)
     ) x
     WHERE (asset_class = 'crypto' AND n <= $1) OR (asset_class = 'stock' AND n <= $2) OR (asset_class = 'forex' AND n <= $3)`,
    [counts.crypto, counts.stock, counts.forex],
  );
  let made = 0;
  for (const a of res.rows) {
    const slug = defaultSlug(a.id);
    const symbol = a.asset_class === "forex" ? a.id.slice(3).replace("-", "/").toUpperCase() : a.symbol.toUpperCase();
    const ins = await pool().query(
      `INSERT INTO communities (ns, slug, kind, asset_id, asset_class, title, symbol, created_by)
       SELECT 'b', $1, 'asset', $2, $3, $4, $5, $6 WHERE $1 ~ '^[a-z0-9][a-z0-9-]{1,49}$'
       ON CONFLICT DO NOTHING`,
      [slug, a.id, a.asset_class, a.name.slice(0, 80), symbol, admin.id],
    );
    made += ins.rowCount ?? 0;
  }
  uncache("community:asset:");
  await logAction(admin, "community.defaults", null, { ...counts, made });
  return made;
}

/** Admins and the community's moderators edit its description and rules; admins also rename and retitle. */
export async function updateCommunity(
  v: Viewer,
  id: string,
  input: { title?: string; description?: string; rules?: string; slug?: string },
): Promise<string | null> {
  const c = await getCommunityById(id);
  if (!c) return "That community is gone.";
  const admin = v.role === "admin" && v.twoFactor;
  if (!admin && !(await canModerateCommunity(v, id))) return "Only admins and this community's moderators can edit it.";
  const description = input.description === undefined ? c.description : clean(input.description, COMMUNITY_LIMITS.descriptionMax);
  const rules = input.rules === undefined ? c.rules : clean(input.rules, COMMUNITY_LIMITS.rulesMax);
  const title = admin && input.title !== undefined ? clean(input.title, COMMUNITY_LIMITS.titleMax) : c.title;
  if (!title) return "Give it a name.";
  const problem =
    textProblem(title, "The name", admin) ?? textProblem(description, "The description", admin) ?? textProblem(rules, "The rules", admin);
  if (problem) return problem;
  let slug = c.slug;
  if (admin && input.slug !== undefined && normalizeSlug(input.slug) !== c.slug) {
    slug = normalizeSlug(input.slug);
    const err = slugProblem(slug, await takenSlugs(c.assetId));
    if (err) return err;
  }
  await pool().query(`UPDATE communities SET title = $2, description = $3, rules = $4, slug = $5 WHERE id = $1`, [
    id,
    title,
    description,
    rules,
    slug,
  ]);
  if (c.assetId) uncache(`community:asset:${c.assetId}`);
  await logAction(v, "community.edit", c.label, { slug: slug !== c.slug ? slug : undefined });
  return null;
}

export async function setCommunityStatus(admin: Viewer, id: string, status: "active" | "suspended"): Promise<string | null> {
  const res = await pool().query<{ asset_id: string | null; ns: string; slug: string }>(
    `UPDATE communities SET status = $2 WHERE id = $1 RETURNING asset_id, ns, slug`,
    [id, status],
  );
  const row = res.rows[0];
  if (!row) return "That community is gone.";
  if (row.asset_id) uncache(`community:asset:${row.asset_id}`);
  await logAction(admin, status === "active" ? "community.restore" : "community.suspend", `${row.ns}/${row.slug}`);
  return null;
}

/** Admins make a member (by email or public name) a moderator of one community, or take it away. */
export async function setCommunityMod(admin: Viewer, communityId: string, who: string, mod: boolean): Promise<string | null> {
  const c = await getCommunityById(communityId);
  if (!c) return "That community is gone.";
  const u = await pool().query<{ id: string; is_bot: boolean }>(
    `SELECT id, is_bot FROM "user" WHERE lower(email) = lower($1) OR lower(chat_name) = lower($1) LIMIT 1`,
    [who.trim()],
  );
  const user = u.rows[0];
  if (!user || user.is_bot) return "No member has that email or public name.";
  if (mod) {
    const res = await pool().query<{ inserted: boolean }>(
      `INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'mod')
       ON CONFLICT (community_id, user_id) DO UPDATE SET role = 'mod' RETURNING (xmax = 0) AS inserted`,
      [communityId, user.id],
    );
    if (res.rows[0]?.inserted) await pool().query(`UPDATE communities SET member_count = member_count + 1 WHERE id = $1`, [communityId]);
  } else {
    await pool().query(`UPDATE community_members SET role = 'member' WHERE community_id = $1 AND user_id = $2`, [communityId, user.id]);
  }
  await logAction(admin, mod ? "community.mod.add" : "community.mod.remove", c.label, { who: who.trim() });
  return null;
}

export async function communityMods(communityId: string): Promise<{ id: string; name: string }[]> {
  const res = await pool().query<{ id: string; chat_name: string | null }>(
    `SELECT u.id, u.chat_name FROM community_members m JOIN "user" u ON u.id = m.user_id
     WHERE m.community_id = $1 AND m.role = 'mod' ORDER BY m.joined_at`,
    [communityId],
  );
  return res.rows.map((r) => ({ id: r.id, name: r.chat_name ?? "member" }));
}

/** Bull and bear calls in a community's topics over the last week. */
export async function sentiment(communityId: string): Promise<{ bulls: number; bears: number }> {
  return cached(`sentiment:${communityId}`, 30_000, async () => {
    const res = await pool().query<{ bulls: number; bears: number }>(
      `SELECT count(*) FILTER (WHERE stance = 'bull')::int AS bulls, count(*) FILTER (WHERE stance = 'bear')::int AS bears
       FROM forum_topics WHERE community_id = $1 AND status = 'visible' AND created_at > now() - interval '7 days'`,
      [communityId],
    );
    return res.rows[0] ?? { bulls: 0, bears: 0 };
  });
}

/**
 * Where a $TICKER tag leads: the community for the asset with that symbol
 * (biggest market cap first, crypto before stocks on a tie), else its page,
 * else an m/ token community with that ticker.
 */
export async function resolveTicker(symbol: string): Promise<string | null> {
  const sym = symbol.toUpperCase().slice(0, 20);
  const classes = await enabledClasses();
  const pair = /^[A-Z]{6}$/.test(sym) ? `fx-${sym.slice(0, 3)}-${sym.slice(3)}`.toLowerCase() : null;
  const res = await pool().query<CommunityRecord & { aid: string | null }>(
    `SELECT x.* FROM (
       SELECT c.id::text, c.ns, c.slug, c.kind, c.asset_class, c.status, a.id AS aid, 0 AS pri, a.market_cap
       FROM assets a LEFT JOIN communities c ON c.asset_id = a.id AND c.status = 'active'
       WHERE (upper(a.symbol) = $1 OR a.id = $3) AND a.asset_class = ANY($2)
       UNION ALL
       SELECT c.id::text, c.ns, c.slug, c.kind, c.asset_class, c.status, NULL, 1, NULL
       FROM communities c WHERE c.kind = 'token' AND upper(c.symbol) = $1 AND c.status = 'active' AND 'crypto' = ANY($2)
     ) x ORDER BY pri, market_cap DESC NULLS LAST LIMIT 1`,
    [sym, classes, pair],
  );
  const r = res.rows[0];
  if (!r) return null;
  if (r.id) return communityPath({ ns: r.ns, slug: r.slug, assetClass: r.asset_class, kind: r.kind });
  return r.aid ? assetPath(r.aid) : null;
}

// ---------------------------------------------------------------------------
// Admin log

export async function logAction(actor: Viewer, action: string, target: string | null, detail: object = {}): Promise<void> {
  await pool()
    .query(`INSERT INTO admin_log (actor_id, action, target, detail) VALUES ($1, $2, $3, $4)`, [actor.id, action, target, detail])
    .catch((err) => console.error("admin log write failed", err));
}
