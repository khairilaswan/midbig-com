import "server-only";
import type { AssetClass } from "@midbig/shared";
import { cached, pool } from "./server";

export type Categories = Record<AssetClass, boolean>;

const ALL_ON: Categories = { crypto: true, stock: true, forex: true };

/**
 * Which asset classes the admin has switched on. Off hides that class's
 * pages, lists, search results and communities; its data stays in place.
 * Cached for a few seconds, so a switch takes effect almost at once.
 */
export async function categories(): Promise<Categories> {
  return cached("settings:categories", 5_000, async () => {
    try {
      const res = await pool().query<{ value: Partial<Categories> }>(`SELECT value FROM site_settings WHERE key = 'categories'`);
      return { ...ALL_ON, ...(res.rows[0]?.value ?? {}) };
    } catch (err) {
      // Before the migration runs, everything is on.
      console.error("settings read failed", err);
      return ALL_ON;
    }
  });
}

export async function enabledClasses(): Promise<AssetClass[]> {
  const c = await categories();
  return (Object.keys(c) as AssetClass[]).filter((k) => c[k]);
}

export async function classEnabled(cls: AssetClass | null): Promise<boolean> {
  return cls == null || (await categories())[cls];
}
