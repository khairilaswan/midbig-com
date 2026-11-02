"use server";

import { revalidatePath } from "next/cache";
import type { Look } from "@midbig/shared";
import { isAdmin } from "@/lib/admin";
import { getSession } from "@/lib/auth";
import { getViewer } from "@/lib/chat";
import { saveOwnLook, setSiteLook, siteLook } from "@/lib/look";
import type { ActionResult } from "./actions";

type RawLook = Partial<Record<keyof Look, unknown>>;

/** Saves the visitor's own look (cookie, plus their account when logged in). null goes back to the site default. */
export async function saveLook(raw: RawLook | null): Promise<ActionResult> {
  try {
    if (!(await siteLook()).memberChoice) return { ok: false, error: "The site uses one look for everyone right now." };
    const session = await getSession();
    await saveOwnLook(session?.user.id ?? null, raw && typeof raw === "object" ? raw : null);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("look save failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** The admin's default look for everyone who hasn't picked their own. */
export async function adminSaveLook(raw: RawLook, memberChoice: boolean): Promise<ActionResult> {
  try {
    const session = await getSession();
    const v = session ? await getViewer(session.user.id) : null;
    if (!isAdmin(v)) return { ok: false, error: "The admin portal needs an admin account with two-factor login turned on." };
    await setSiteLook(v, raw ?? {}, Boolean(memberChoice));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("site look save failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
