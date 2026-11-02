import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOOK, lookToString, normalizeLook, parseLook, type Look } from "@midbig/shared";
import type { Viewer } from "./chat";
import { logAction } from "./communities";
import { cached, pool, uncache } from "./server";

/** Cookie holding a visitor's or member's own look, so it applies before any database read. */
export const LOOK_COOKIE = "mb_look";

export interface SiteLook extends Look {
  /** Members and visitors may pick their own look in Appearance settings. */
  memberChoice: boolean;
}

/** The admin's default look for the whole site. */
export async function siteLook(): Promise<SiteLook> {
  return cached("settings:look", 5_000, async () => {
    try {
      const res = await pool().query<{ value: Partial<SiteLook> }>(`SELECT value FROM site_settings WHERE key = 'look'`);
      const v = res.rows[0]?.value ?? {};
      return { ...normalizeLook(v), memberChoice: v.memberChoice !== false };
    } catch (err) {
      console.error("look read failed", err);
      return { ...DEFAULT_LOOK, memberChoice: true };
    }
  });
}

export async function setSiteLook(admin: Viewer, raw: Partial<Record<keyof Look, unknown>>, memberChoice: boolean): Promise<void> {
  const value = { ...normalizeLook(raw), memberChoice };
  await pool().query(
    `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('look', $1, now(), $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [value, admin.id],
  );
  uncache("settings:");
  await logAction(admin, "look.set", null, value);
}

/**
 * The look this request renders with: the person's own pick (from the
 * cookie, else their saved choice), over the site default.
 */
export async function currentLook(userId: string | null): Promise<{ look: Look; site: SiteLook; own: boolean }> {
  const site = await siteLook();
  if (!site.memberChoice) return { look: site, site, own: false };
  const fromCookie = parseLook((await cookies()).get(LOOK_COOKIE)?.value, site);
  if (fromCookie) return { look: fromCookie, site, own: true };
  if (userId) {
    const res = await pool().query<{ look: Partial<Look> }>(`SELECT look FROM "user" WHERE id = $1`, [userId]);
    const saved = res.rows[0]?.look;
    if (saved && Object.keys(saved).length > 0) return { look: normalizeLook(saved, site), site, own: true };
  }
  return { look: site, site, own: false };
}

/** Saves a person's look in the cookie, and on their account when logged in. null goes back to the site default. */
export async function saveOwnLook(userId: string | null, raw: Partial<Record<keyof Look, unknown>> | null): Promise<Look | null> {
  const jar = await cookies();
  if (!raw) {
    jar.delete(LOOK_COOKIE);
    if (userId) await pool().query(`UPDATE "user" SET look = '{}' WHERE id = $1`, [userId]);
    return null;
  }
  const look = normalizeLook(raw, await siteLook());
  jar.set(LOOK_COOKIE, lookToString(look), { path: "/", maxAge: 400 * 24 * 3600, sameSite: "lax", httpOnly: false, secure: process.env.NODE_ENV === "production" });
  if (userId) await pool().query(`UPDATE "user" SET look = $2 WHERE id = $1`, [userId, look]);
  return look;
}
