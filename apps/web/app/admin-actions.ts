"use server";

import { revalidatePath } from "next/cache";
import { createBot, isAdmin, setCategories, setVerified, updateBot, type BotInput } from "@/lib/admin";
import { getSession } from "@/lib/auth";
import { getViewer, type Viewer } from "@/lib/chat";
import { createDefaults, setCommunityMod, setCommunityStatus } from "@/lib/communities";
import type { ActionResult } from "./actions";

const NOT_ADMIN = "The admin portal needs an admin account with two-factor login turned on.";

async function admin(): Promise<Viewer> {
  const session = await getSession();
  const v = session ? await getViewer(session.user.id) : null;
  if (!isAdmin(v)) throw new Error(NOT_ADMIN);
  return v;
}

async function attempt(fn: () => Promise<void | string | null>, path = "/admin"): Promise<ActionResult> {
  try {
    const error = await fn();
    if (!error) revalidatePath(path, "layout");
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === NOT_ADMIN) return { ok: false, error: NOT_ADMIN };
    console.error("admin action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const validId = (id: unknown): id is string => typeof id === "string" && /^\d{1,18}$/.test(id);

export async function adminSetCategory(cls: string, on: boolean): Promise<ActionResult> {
  return attempt(async () => {
    if (cls !== "crypto" && cls !== "stock" && cls !== "forex") return "Unknown category.";
    await setCategories(await admin(), { [cls]: Boolean(on) });
  }, "/");
}

export async function adminCreateDefaults(counts: { crypto: number; stock: number; forex: number }): Promise<ActionResult & { made?: number }> {
  let made = 0;
  const r = await attempt(async () => {
    const n = (x: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
    made = await createDefaults(await admin(), { crypto: n(counts.crypto, 500), stock: n(counts.stock, 600), forex: n(counts.forex, 100) });
  });
  return r.ok ? { ok: true, made } : r;
}

export async function adminCommunityStatus(id: string, status: "active" | "suspended"): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(id) || (status !== "active" && status !== "suspended")) return "That community is gone.";
    return setCommunityStatus(await admin(), id, status);
  });
}

export async function adminCommunityMod(id: string, who: string, mod: boolean): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(id)) return "That community is gone.";
    return setCommunityMod(await admin(), id, String(who ?? ""), Boolean(mod));
  });
}

export async function adminVerify(userId: string, verified: boolean): Promise<ActionResult> {
  return attempt(async () => setVerified(await admin(), String(userId), Boolean(verified)));
}

export async function adminCreateBot(input: BotInput): Promise<ActionResult> {
  return attempt(async () => createBot(await admin(), input));
}

export async function adminUpdateBot(userId: string, input: BotInput): Promise<ActionResult> {
  return attempt(async () => updateBot(await admin(), String(userId), input));
}
