"use server";

import { isNamespace, type AssetClass } from "@midbig/shared";
import { getSession } from "@/lib/auth";
import { getViewer, type Viewer } from "@/lib/chat";
import { createCommunity, setMember, updateCommunity } from "@/lib/communities";
import type { ActionResult } from "./actions";

const LOGIN = "Please log in again.";

async function viewer(): Promise<Viewer> {
  const session = await getSession();
  const v = session ? await getViewer(session.user.id) : null;
  if (!v) throw new Error(LOGIN);
  return v;
}

async function attempt(fn: () => Promise<void | string | null>): Promise<ActionResult> {
  try {
    const error = await fn();
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === LOGIN) return { ok: false, error: LOGIN };
    console.error("community action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const validId = (id: unknown): id is string => typeof id === "string" && /^\d{1,18}$/.test(id);

export async function joinCommunity(communityId: string, join: boolean): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(communityId)) return "That community is gone.";
    return setMember(await viewer(), communityId, Boolean(join));
  });
}

export async function newCommunity(input: {
  ns: string;
  slug: string;
  title: string;
  symbol?: string;
  description?: string;
  assetId?: string | null;
  hub?: boolean;
  hubClass?: string | null;
  chain?: string;
  contract?: string;
  website?: string;
}): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const ns = String(input.ns ?? "");
    if (!isNamespace(ns)) return { ok: false, error: "Pick b/ or m/." };
    const hubClass = ["crypto", "stock", "forex"].includes(String(input.hubClass)) ? (input.hubClass as AssetClass) : null;
    const r = await createCommunity(await viewer(), {
      ns,
      slug: String(input.slug ?? ""),
      title: String(input.title ?? ""),
      symbol: input.symbol ? String(input.symbol) : undefined,
      description: input.description ? String(input.description) : undefined,
      assetId: input.assetId ? String(input.assetId) : null,
      hub: Boolean(input.hub),
      hubClass,
      tokenInfo: { chain: input.chain, contract: input.contract, website: input.website },
    });
    return r.ok ? { ok: true, path: r.path } : r;
  } catch (err) {
    if (err instanceof Error && err.message === LOGIN) return { ok: false, error: LOGIN };
    console.error("community create failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function editCommunity(
  communityId: string,
  input: { title?: string; description?: string; rules?: string; slug?: string },
): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(communityId)) return "That community is gone.";
    const s = (x: unknown) => (x === undefined ? undefined : String(x));
    return updateCommunity(await viewer(), communityId, {
      title: s(input.title),
      description: s(input.description),
      rules: s(input.rules),
      slug: s(input.slug),
    });
  });
}
