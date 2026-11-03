import { MEDIA_EXT } from "@midbig/shared";
import { readMedia } from "@/lib/media";

/**
 * Serves a stored photo. Photos never change, but a moderator can take one
 * down, so caches keep them for a day rather than for good. The headers stop
 * a browser from treating the bytes as anything but the image type we checked.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const [id, ext] = (await params).file.split(".");
  const m = id ? await readMedia(id) : null;
  if (!m || MEDIA_EXT[m.mime] !== ext) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });
  return new Response(new Uint8Array(m.bytes), {
    headers: {
      "content-type": m.mime,
      "content-length": String(m.bytes.byteLength),
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-site",
    },
  });
}
