import "server-only";
import type { Viewer } from "./chat";
import { logAction } from "./communities";
import { DEFAULT_LAYOUTS, normalizeLayouts, normalizeTemplateLayout, type BlockTemplate, type HomeLayouts } from "./home-layout";
import { cached, pool, uncache } from "./server";

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

/** Saves one template's layout; null puts it back to the original. */
export async function setHomeLayout(admin: Viewer, template: BlockTemplate, raw: unknown | null): Promise<void> {
  const all = { ...(await homeLayouts()) } as Partial<HomeLayouts>;
  if (raw == null) delete all[template];
  else all[template] = normalizeTemplateLayout(template, raw);
  await pool().query(
    `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES ('home_layouts', $1, now(), $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [all, admin.id],
  );
  uncache("settings:");
  await logAction(admin, raw == null ? "home_layout.reset" : "home_layout.set", template, { blocks: raw == null ? 0 : Object.values(all[template]!).flat().length });
}
