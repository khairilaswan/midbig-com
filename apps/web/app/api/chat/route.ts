import { NextResponse } from "next/server";
import { parseRoom } from "@midbig/shared";
import { getSession, turnstile } from "@/lib/auth";
import { canModerate, getViewer, loadMessages, mutedIds, postBlock, postMessage } from "@/lib/chat";
import type { ChatState } from "@/lib/types";

const noStore = { "cache-control": "no-store" };

/** A room's messages (latest, or ?before= / ?after= a message id) and what the viewer may do. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const room = params.get("room") ?? "";
  if (!parseRoom(room)) return NextResponse.json({ error: "Unknown room" }, { status: 404 });
  const session = await getSession();
  const viewer = session ? await getViewer(session.user.id) : null;
  const [messages, muted] = await Promise.all([
    loadMessages(room, {
      before: params.get("before") ?? undefined,
      after: params.get("after") ?? undefined,
      viewerId: viewer?.id,
    }),
    viewer ? mutedIds(viewer.id) : [],
  ]);
  const state: ChatState = {
    messages,
    muted,
    me: viewer && {
      id: viewer.id,
      name: viewer.chatName,
      isStaff: viewer.isStaff,
      canModerate: canModerate(viewer),
      block: postBlock(viewer),
    },
    captchaSiteKey: turnstile?.siteKey ?? null,
  };
  return NextResponse.json(state, { headers: noStore });
}

export async function POST(req: Request) {
  let input: { room?: unknown; body?: unknown; captcha?: unknown };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const session = await getSession();
  const viewer = session ? await getViewer(session.user.id) : null;
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const result = await postMessage(viewer, {
      room: String(input.room ?? ""),
      body: String(input.body ?? ""),
      captcha: typeof input.captcha === "string" ? input.captcha : undefined,
      ip,
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (err) {
    console.error("chat post failed", err);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
