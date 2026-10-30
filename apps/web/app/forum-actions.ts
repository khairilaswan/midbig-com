"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { REPORT_REASONS, type ReportReason } from "@midbig/shared";
import { getSession } from "@/lib/auth";
import { canModerate, getViewer, type Viewer } from "@/lib/chat";
import {
  approvePosts,
  createReply,
  createTopic,
  deleteOwnPost,
  editPost,
  removePosts,
  reportPost,
  setBio,
  setHelpful,
  setTopicFlag,
  type WriteResult,
} from "@/lib/forum";
import type { ActionResult } from "./actions";

const LOGIN = "Please log in again.";
const NOT_MOD = "Moderator tools need a moderator account with two-factor login turned on.";

async function viewerOrNull(): Promise<Viewer | null> {
  const session = await getSession();
  return session ? getViewer(session.user.id) : null;
}

async function viewer(): Promise<Viewer> {
  const v = await viewerOrNull();
  if (!v) throw new Error(LOGIN);
  return v;
}

async function moderator(): Promise<Viewer> {
  const v = await viewer();
  if (!canModerate(v)) throw new Error(NOT_MOD);
  return v;
}

async function attempt(fn: () => Promise<void | string | null>): Promise<ActionResult> {
  try {
    const error = await fn();
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    if (err instanceof Error && (err.message === LOGIN || err.message === NOT_MOD)) return { ok: false, error: err.message };
    console.error("forum action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function validId(id: unknown): id is string {
  return typeof id === "string" && /^\d{1,18}$/.test(id);
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function write(fn: () => Promise<WriteResult>): Promise<WriteResult> {
  try {
    return await fn();
  } catch (err) {
    console.error("forum post failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function startTopic(input: {
  category: string;
  assetId?: string | null;
  title: string;
  body: string;
  captcha?: string;
}): Promise<WriteResult> {
  return write(async () => {
    const r = await createTopic(await viewerOrNull(), {
      category: String(input.category ?? ""),
      assetId: input.assetId ? String(input.assetId) : null,
      title: String(input.title ?? ""),
      body: String(input.body ?? ""),
      captcha: typeof input.captcha === "string" ? input.captcha : undefined,
      ip: await clientIp(),
    });
    if (r.ok) revalidatePath("/forum");
    return r;
  });
}

export async function postReply(input: { topicId: string; body: string; captcha?: string }): Promise<WriteResult> {
  return write(async () => {
    if (!validId(input.topicId)) return { ok: false, error: "That topic is gone." };
    return createReply(await viewerOrNull(), {
      topicId: input.topicId,
      body: String(input.body ?? ""),
      captcha: typeof input.captcha === "string" ? input.captcha : undefined,
      ip: await clientIp(),
    });
  });
}

export async function updatePost(postId: string, body: string, title?: string): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(postId)) return "That post is gone.";
    return editPost(await viewer(), postId, String(body ?? ""), title == null ? undefined : String(title));
  });
}

export async function deletePost(postId: string): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(postId)) return "That post is gone.";
    await deleteOwnPost(await viewer(), postId);
  });
}

export async function voteHelpful(postId: string, on: boolean): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(postId)) return "That post is gone.";
    return setHelpful(await viewer(), postId, Boolean(on));
  });
}

export async function reportForumPost(postId: string, reason: ReportReason): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(postId)) return "That post is gone.";
    if (!Object.hasOwn(REPORT_REASONS, reason)) return "Pick a reason.";
    return reportPost(await viewer(), postId, reason);
  });
}

export async function saveBio(bio: string): Promise<ActionResult> {
  return attempt(async () => setBio(await viewer(), String(bio ?? "")));
}

export async function modForumApprove(postIds: string[]): Promise<ActionResult> {
  return attempt(async () => {
    await approvePosts(await moderator(), postIds.filter(validId).slice(0, 200));
    revalidatePath("/mod");
  });
}

export async function modForumRemove(postIds: string[]): Promise<ActionResult> {
  return attempt(async () => {
    await removePosts(await moderator(), postIds.filter(validId).slice(0, 200));
    revalidatePath("/mod");
  });
}

export async function modTopicFlag(topicId: string, flag: "pinned" | "locked", value: boolean): Promise<ActionResult> {
  return attempt(async () => {
    await moderator();
    if (!validId(topicId) || (flag !== "pinned" && flag !== "locked")) return "That topic is gone.";
    await setTopicFlag(topicId, flag, Boolean(value));
  });
}
