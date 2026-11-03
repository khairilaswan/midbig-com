import "server-only";
import { isAdmin } from "./admin";
import type { Viewer } from "./chat";
import { logAction } from "./communities";
import { DEFAULT_LAYOUTS, normalizeLayout, normalizeLayouts, type BlockTemplate, type HomeLayouts, type LayoutEditing, type TemplateLayout } from "./home-layout";
import { cached, pool, uncache } from "./server";

async function putSetting(key: string, value: unknown, admin: Viewer): Promise<void> {
  await pool().query(
    `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ($1, $2, now(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), admin.id],
  );
  uncache("settings:");
}

/** The admin's home page layouts, one per community-first template. */
export async function homeLayouts(): Promise<HomeLayouts> {
  return cached("settings:home_layouts", 5_000, async () => {
    try {
      const res = await pool().query<{ value: unknown }>(`SELECT value FROM site_settings WHERE key = 'home_layouts'`);
      return normalizeLayouts(res.rows[0]?.value);
    } catch (err) {
      console.error("home layout read failed", err);
      return DEFAULT_LAYOUTS;
    }
  });
}

/** Saves one template's site layout; null puts it back to the original. */
export async function setHomeLayout(admin: Viewer, template: BlockTemplate, raw: unknown | null): Promise<void> {
  const all = { ...(await homeLayouts()) } as Partial<HomeLayouts>;
  if (raw == null) delete all[template];
  else all[template] = normalizeLayout(template, raw);
  await putSetting("home_layouts", all, admin);
  await logAction(admin, raw == null ? "home_layout.reset" : "home_layout.set", template, {});
}

/** Whether members may arrange their own home page, and creators their community's page. */
export async function layoutEditing(): Promise<LayoutEditing> {
  return cached("settings:layout_editing", 5_000, async () => {
    try {
      const res = await pool().query<{ value: Partial<LayoutEditing> }>(`SELECT value FROM site_settings WHERE key = 'layout_editing'`);
      const v = res.rows[0]?.value ?? {};
      return { members: v.members !== false, communities: v.communities !== false };
    } catch (err) {
      console.error("layout editing read failed", err);
      return { members: false, communities: false };
    }
  });
}

export async function setLayoutEditing(admin: Viewer, next: Partial<LayoutEditing>): Promise<void> {
  const value = { ...(await layoutEditing()), ...next };
  await putSetting("layout_editing", value, admin);
  await logAction(admin, "layout_editing.set", null, value);
}

/** A member's own layouts, over the site's, for templates they arranged. */
export async function memberHomeLayouts(userId: string): Promise<{ layouts: HomeLayouts; custom: BlockTemplate[] }> {
  const site = await homeLayouts();
  const res = await pool().query<{ home_layouts: Record<string, unknown> | null }>(`SELECT home_layouts FROM "user" WHERE id = $1`, [userId]);
  const own = res.rows[0]?.home_layouts ?? {};
  return { layouts: normalizeLayouts(own, site), custom: (Object.keys(own) as BlockTemplate[]).filter((t) => t in site) };
}

/** The layout a viewer sees for a template: their own when allowed and set, else the site's. */
export async function viewerHomeLayout(userId: string | null, template: BlockTemplate): Promise<TemplateLayout> {
  if (userId && (await layoutEditing()).members) return (await memberHomeLayouts(userId)).layouts[template];
  return (await homeLayouts())[template];
}

/** Saves a member's own layout for a template; null goes back to the site's. */
export async function setMemberHomeLayout(userId: string, template: BlockTemplate, raw: unknown | null): Promise<void> {
  if (raw == null) {
    await pool().query(`UPDATE "user" SET home_layouts = home_layouts - $2::text WHERE id = $1`, [userId, template]);
  } else {
    await pool().query(`UPDATE "user" SET home_layouts = jsonb_set(home_layouts, ARRAY[$2::text], $3::jsonb) WHERE id = $1`, [
      userId,
      template,
      JSON.stringify(normalizeLayout(template, raw)),
    ]);
  }
}

/** A community page's layout. */
export function communityLayout(stored: unknown): TemplateLayout {
  return stored ? normalizeLayout("community", stored) : DEFAULT_LAYOUTS.community;
}

/** Saves a community page's layout; null goes back to the standard one. */
export async function setCommunityLayout(actor: Viewer, communityId: string, raw: unknown | null): Promise<void> {
  const value = raw == null ? null : JSON.stringify(normalizeLayout("community", raw));
  await pool().query(`UPDATE communities SET layout = $2::jsonb WHERE id = $1`, [communityId, value]);
  uncache("community:");
  await logAction(actor, raw == null ? "community_layout.reset" : "community_layout.set", communityId, {});
}

/** Who may arrange a community's page: its creator while the switch is on, and site admins always. */
export async function canEditCommunityLayout(viewer: Viewer | null, community: { createdBy: string | null }): Promise<boolean> {
  if (!viewer) return false;
  const id = viewer.id;
  if (isAdmin(viewer)) return true;
  return community.createdBy != null && community.createdBy === id && (await layoutEditing()).communities;
}
