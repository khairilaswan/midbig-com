import "server-only";
import { randomBytes } from "node:crypto";
import { CHAT_LIMITS, isMediaId, MEDIA_LIMITS, mediaUrl, sniffImage, type MediaKind, type MediaType } from "@midbig/shared";
import type { Viewer } from "./chat";
import { pool, redis } from "./server";

export interface StoredMedia {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

/** Pixel size from a PNG, GIF, WebP or JPEG header; null when it can't be read. */
export function imageSize(b: Uint8Array, type: MediaType): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (type === "image/png") return { width: v.getUint32(16), height: v.getUint32(20) };
    if (type === "image/gif") return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
    if (type === "image/webp") {
      const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
      if (chunk === "VP8X") return { width: 1 + (v.getUint32(24, true) & 0xffffff), height: 1 + (v.getUint32(27, true) & 0xffffff) };
      if (chunk === "VP8 ") return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = v.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // JPEG: walk the markers to the first start-of-frame.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = v.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  } catch {
    // A truncated header: no size.
  }
  return null;
}

const MAX_PIXELS = 40_000_000;

/**
 * Stores a photo for the member. Checks the real file type from its bytes,
 * the size, the daily upload cap, and that new accounts wait a day before
 * adding photos to posts (photos can carry the same spam links can).
 */
export async function storeMedia(v: Viewer, kind: MediaKind, bytes: Uint8Array): Promise<StoredMedia | string> {
  if (v.bannedUntil != null) return "A moderator has paused your account.";
  if (kind === "post" && !v.isStaff && Date.now() - v.createdAt < MEDIA_LIMITS.noPhotosMs) {
    return "New accounts can add photos to posts after their first day.";
  }
  if (kind !== "post" && !v.isStaff && Date.now() - v.createdAt < CHAT_LIMITS.readOnlyMs) {
    return "New accounts can add a photo after their first 10 minutes.";
  }
  if (bytes.byteLength === 0) return "That file is empty.";
  if (bytes.byteLength > MEDIA_LIMITS.maxBytes) return "That photo is too big. The limit is 2 MB.";
  const type = sniffImage(bytes);
  if (!type) return "Only JPEG, PNG, WebP and GIF photos work.";
  const size = imageSize(bytes, type);
  if (size && size.width * size.height > MAX_PIXELS) return "That photo has too many pixels.";

  if (!v.isStaff) {
    const key = `media:day:${v.id}:${new Date().toISOString().slice(0, 10)}`;
    try {
      const [[, n]] = (await redis().multi().incr(key).expire(key, 86_400).exec()) as [[unknown, number]];
      if (n > MEDIA_LIMITS.perDay) return `That's today's limit of ${MEDIA_LIMITS.perDay} photos.`;
    } catch (err) {
      console.error("media rate limit check failed", err);
      return "Uploads are having trouble right now. Please try again shortly.";
    }
  }

  const id = randomBytes(16).toString("base64url");
  await pool().query(
    `INSERT INTO media (id, user_id, kind, mime, bytes, size, width, height) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, v.id, kind, type, Buffer.from(bytes), bytes.byteLength, size?.width ?? null, size?.height ?? null],
  );
  if (kind === "avatar" || kind === "banner") {
    const col = kind === "avatar" ? "avatar_id" : "banner_id";
    const prev = await pool().query<{ old: string | null }>(
      `UPDATE "user" u SET ${col} = $2 FROM (SELECT ${col} AS old FROM "user" WHERE id = $1) p WHERE u.id = $1 RETURNING p.old`,
      [v.id, id],
    );
    const old = prev.rows[0]?.old;
    if (old) await pool().query(`DELETE FROM media WHERE id = $1 AND user_id = $2`, [old, v.id]);
  }
  return { id, url: mediaUrl(id, type), width: size?.width ?? null, height: size?.height ?? null };
}

/** Removes the member's profile photo or banner. */
export async function clearProfileMedia(userId: string, kind: "avatar" | "banner"): Promise<void> {
  const col = kind === "avatar" ? "avatar_id" : "banner_id";
  const res = await pool().query<{ old: string | null }>(
    `UPDATE "user" u SET ${col} = NULL FROM (SELECT ${col} AS old FROM "user" WHERE id = $1) p WHERE u.id = $1 RETURNING p.old`,
    [userId],
  );
  const old = res.rows[0]?.old;
  if (old) await pool().query(`DELETE FROM media WHERE id = $1`, [old]);
}

/**
 * The photo ids a member may attach to a post: their own, uploaded for
 * posts, still visible. Keeps the order given and drops anything else.
 */
export async function ownPostMedia(userId: string, raw: unknown): Promise<string[]> {
  if (!Array.isArray(raw)) return [];
  const ids = [...new Set(raw.filter(isMediaId))].slice(0, MEDIA_LIMITS.perPost);
  if (ids.length === 0) return [];
  const res = await pool().query<{ id: string }>(
    `SELECT id FROM media WHERE id = ANY($1) AND user_id = $2 AND kind = 'post' AND status = 'visible'`,
    [ids, userId],
  );
  const ok = new Set(res.rows.map((r) => r.id));
  return ids.filter((id) => ok.has(id));
}

/** Photo URLs for these ids, in order, skipping removed ones. */
export async function mediaUrls(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const res = await pool().query<{ id: string; mime: MediaType }>(
    `SELECT id, mime FROM media WHERE id = ANY($1) AND status = 'visible'`,
    [[...new Set(ids)]],
  );
  for (const r of res.rows) out.set(r.id, mediaUrl(r.id, r.mime));
  return out;
}

/** Hides the photos on these posts, when moderators remove the posts. */
export async function hidePostMedia(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  await pool().query(
    `UPDATE media SET status = 'removed' WHERE id IN (SELECT unnest(images) FROM forum_posts WHERE id = ANY($1::bigint[]))`,
    [postIds],
  );
}

/** Brings back photos on posts a moderator approved after all. */
export async function showPostMedia(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  await pool().query(
    `UPDATE media SET status = 'visible' WHERE id IN (SELECT unnest(images) FROM forum_posts WHERE id = ANY($1::bigint[]))`,
    [postIds],
  );
}

export async function readMedia(id: string): Promise<{ mime: MediaType; bytes: Buffer } | null> {
  if (!isMediaId(id)) return null;
  const res = await pool().query<{ mime: MediaType; bytes: Buffer }>(
    `SELECT mime, bytes FROM media WHERE id = $1 AND status = 'visible'`,
    [id],
  );
  return res.rows[0] ?? null;
}
