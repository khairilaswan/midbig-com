"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isStance, REPORT_REASONS, type ReportReason, type Stance } from "@midbig/shared";
import { getSession } from "@/lib/auth";
import { canModerate, getViewer, type Viewer } from "@/lib/chat";
import { canModerateCommunity, logAction } from "@/lib/communities";
import {
  approvePosts,
  createReply,
  createTopic,
  deleteOwnPost,
  editPost,
  postCommunity,
  removePosts,
  reportPost,
  setBio,
  setTopicFlag,
  topicCommunity,
  vote,
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
  communityId: string;
  title: string;
  body: string;
  stance?: Stance | null;
  captcha?: string;
}): Promise<WriteResult> {
  return write(async () => {
    if (!validId(input.communityId)) return { ok: false, error: "Pick a community to post in." };
    const r = await createTopic(await viewerOrNull(), {
      communityId: input.communityId,
      title: String(input.title ?? ""),
      body: String(input.body ?? ""),
      stance: isStance(input.stance) ? input.stance : null,
      captcha: typeof input.captcha === "string" ? input.captcha : undefined,
      ip: await clientIp(),
    });
    if (r.ok) revalidatePath("/forum");
    return r;
  });
}

export async function postReply(input: { topicId: string; parentId?: string | null; body: string; captcha?: string }): Promise<WriteResult> {
  return write(async () => {
    if (!validId(input.topicId)) return { ok: false, error: "That topic is gone." };
    return createReply(await viewerOrNull(), {
      topicId: input.topicId,
      parentId: validId(input.parentId) ? input.parentId : null,
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

export async function castVote(postId: string, value: number): Promise<ActionResult> {
  return attempt(async () => {
    if (!validId(postId)) return "That post is gone.";
    if (value !== 1 && value !== -1 && value !== 0) return "Pick up or down.";
    return vote(await viewer(), postId, value);
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

/** Site moderators, or this community's own moderators, remove one post. */
export async function communityRemove(postId: string): Promise<ActionResult> {
  return attempt(async () => {
    const v = await viewer();
    const communityId = validId(postId) ? await postCommunity(postId) : null;
    if (!communityId) return "That post is gone.";
    if (!(await canModerateCommunity(v, communityId))) return NOT_MOD;
    await removePosts(v, [postId]);
    if (!canModerate(v)) await logAction(v, "post.remove", postId, { communityId });
  });
}

export async function modTopicFlag(topicId: string, flag: "pinned" | "locked", value: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const v = await viewer();
    if (!validId(topicId) || (flag !== "pinned" && flag !== "locked")) return "That topic is gone.";
    const communityId = await topicCommunity(topicId);
    if (!communityId || !(await canModerateCommunity(v, communityId))) return NOT_MOD;
    await setTopicFlag(topicId, flag, Boolean(value));
  });
}
