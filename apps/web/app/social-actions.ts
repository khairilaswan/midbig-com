"use server";

import { getSession } from "@/lib/auth";
import { getViewer, type Viewer } from "@/lib/chat";
import { setFollow, setReaction, setSaved, votePoll } from "@/lib/social";
import type { ActionResult } from "./actions";

const LOGIN = "Please log in first.";

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
    console.error("social action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const validId = (id: unknown): id is string => typeof id === "string" && /^\d{1,18}$/.test(id);

export async function followMember(userId: string, on: boolean): Promise<ActionResult> {
  return attempt(async () => (typeof userId === "string" && userId ? setFollow(await viewer(), userId, Boolean(on)) : "That member is gone."));
}

export async function saveTopic(topicId: string, on: boolean): Promise<ActionResult> {
  return attempt(async () => (validId(topicId) ? setSaved(await viewer(), topicId, Boolean(on)) : "That topic is gone."));
}

export async function reactToPost(postId: string, emoji: string, on: boolean): Promise<ActionResult> {
  return attempt(async () => (validId(postId) ? setReaction(await viewer(), postId, emoji, Boolean(on)) : "That post is gone."));
}

export async function castPollVote(topicId: string, choice: number): Promise<ActionResult> {
  return attempt(async () => (validId(topicId) ? votePoll(await viewer(), topicId, Number(choice)) : "That poll is gone."));
}
