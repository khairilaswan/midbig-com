import { NextResponse } from "next/server";
import { isMediaKind, MEDIA_LIMITS } from "@midbig/shared";
import { getSession } from "@/lib/auth";
import { getViewer } from "@/lib/chat";
import { clearProfileMedia, storeMedia } from "@/lib/media";
import { SITE_URL } from "@/lib/site";

const noStore = { "cache-control": "no-store" };

/** Uploads only come from our own pages. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return origin === SITE_URL || (host != null && new URL(origin).host === host);
}

/** Stores one photo: form fields `file` and `kind` (post, avatar or banner). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Upload from midbig itself." }, { status: 403, headers: noStore });
  const session = await getSession();
  const viewer = session ? await getViewer(session.user.id) : null;
  if (!viewer) return NextResponse.json({ error: "Please log in to add photos." }, { status: 401, headers: noStore });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MEDIA_LIMITS.maxBytes + 64 * 1024) {
    return NextResponse.json({ error: "That photo is too big. The limit is 2 MB." }, { status: 413, headers: noStore });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "That upload didn't come through." }, { status: 400, headers: noStore });
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (!isMediaKind(kind) || !(file instanceof Blob)) {
    return NextResponse.json({ error: "That upload didn't come through." }, { status: 400, headers: noStore });
  }
  try {
    const r = await storeMedia(viewer, kind, new Uint8Array(await file.arrayBuffer()));
    if (typeof r === "string") return NextResponse.json({ error: r }, { status: 400, headers: noStore });
    return NextResponse.json(r, { headers: noStore });
  } catch (err) {
    console.error("media upload failed", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: noStore });
  }
}

/** Removes the member's profile photo (?kind=avatar) or banner (?kind=banner). */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please log in." }, { status: 401, headers: noStore });
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "avatar" && kind !== "banner") return NextResponse.json({ error: "Unknown kind" }, { status: 400, headers: noStore });
  await clearProfileMedia(session.user.id, kind);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
