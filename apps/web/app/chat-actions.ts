"use server";

import { revalidatePath } from "next/cache";
import { REPORT_REASONS, type ReportReason } from "@midbig/shared";
import { getSession } from "@/lib/auth";
import {
  approveMessages,
  banUser,
  canModerate,
  deleteOwnMessage,
  getViewer,
  removeMessages,
  reportMessage,
  setChatName,
  setModerator,
  setMuted,
  unbanUser,
  type Viewer,
} from "@/lib/chat";
import type { ActionResult } from "./actions";

const LOGIN = "Please log in again.";
const NOT_MOD = "Moderator tools need a moderator account with two-factor login turned on.";

async function viewer(): Promise<Viewer> {
  const session = await getSession();
  const v = session ? await getViewer(session.user.id) : null;
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
    console.error("chat action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function ids(list: string[]): string[] {
  return list.filter((id) => /^\d{1,18}$/.test(id)).slice(0, 200);
}

export async function saveChatName(name: string): Promise<ActionResult> {
  return attempt(async () => setChatName(await viewer(), String(name)));
}

export async function deleteMyMessage(id: string): Promise<ActionResult> {
  return attempt(async () => {
    if (!ids([id]).length) return "That message is gone.";
    await deleteOwnMessage(await viewer(), id);
  });
}

export async function report(id: string, reason: ReportReason): Promise<ActionResult> {
  return attempt(async () => {
    if (!ids([id]).length) return "That message is gone.";
    if (!(reason in REPORT_REASONS)) return "Pick a reason.";
    return reportMessage(await viewer(), id, reason);
  });
}

export async function mute(userId: string, muted: boolean): Promise<ActionResult> {
  return attempt(async () => setMuted(await viewer(), String(userId), Boolean(muted)));
}

export async function modApprove(messageIds: string[]): Promise<ActionResult> {
  return attempt(async () => {
    await approveMessages(await moderator(), ids(messageIds));
    revalidatePath("/mod");
  });
}

export async function modRemove(messageIds: string[]): Promise<ActionResult> {
  return attempt(async () => {
    await removeMessages(await moderator(), ids(messageIds));
    revalidatePath("/mod");
  });
}

/** hours null bans for good. */
export async function modBan(userId: string, hours: number | null, reason: string): Promise<ActionResult> {
  return attempt(async () => {
    if (hours != null && !(Number.isFinite(hours) && hours > 0 && hours <= 24 * 365)) return "Pick a ban length.";
    const error = await banUser(await moderator(), String(userId), hours, String(reason ?? ""));
    revalidatePath("/mod");
    return error;
  });
}

export async function modUnban(userId: string): Promise<ActionResult> {
  return attempt(async () => {
    await moderator();
    await unbanUser(String(userId));
    revalidatePath("/mod");
  });
}

export async function adminSetModerator(who: string, makeModerator: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const v = await moderator();
    if (v.role !== "admin") return "Only admins can change moderators.";
    const error = await setModerator(String(who), Boolean(makeModerator));
    revalidatePath("/mod");
    return error;
  });
}
