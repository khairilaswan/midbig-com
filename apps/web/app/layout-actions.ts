"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { getViewer } from "@/lib/chat";
import { getCommunityById } from "@/lib/communities";
import { BLOCK_TEMPLATES, type BlockTemplate } from "@/lib/home-layout";
import { canEditCommunityLayout, layoutEditing, setCommunityLayout, setMemberHomeLayout } from "@/lib/home-layout-store";
import type { ActionResult } from "./actions";

const OOPS = "Something went wrong. Please try again.";

/** A member's own home page layout for one template; null goes back to the site's. */
export async function saveMyHomeLayout(template: string, layout: unknown | null): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Log in to arrange your home page." };
    if (!(await layoutEditing()).members) return { ok: false, error: "Arranging your own home page is switched off right now." };
    if (!BLOCK_TEMPLATES.includes(template as BlockTemplate)) return { ok: false, error: "Unknown template." };
    await setMemberHomeLayout(session.user.id, template as BlockTemplate, layout ?? null);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("member layout save failed", err);
    return { ok: false, error: OOPS };
  }
}

/** A community page's layout. The first argument is bound on the page. */
export async function saveCommunityLayout(communityId: string, _key: string, layout: unknown | null): Promise<ActionResult> {
  try {
    const session = await getSession();
    const viewer = session ? await getViewer(session.user.id) : null;
    const c = await getCommunityById(String(communityId));
    if (!c || c.status !== "active") return { ok: false, error: "That community is gone." };
    if (!(await canEditCommunityLayout(viewer, c))) return { ok: false, error: "Only this community's creator can arrange its page." };
    await setCommunityLayout(viewer!, c.id, layout ?? null);
    revalidatePath(c.path);
    return { ok: true };
  } catch (err) {
    console.error("community layout save failed", err);
    return { ok: false, error: OOPS };
  }
}
