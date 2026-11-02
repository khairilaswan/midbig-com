"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  FLAIRS,
  MEDIA_LIMITS,
  POLL_LIMITS,
  REACTIONS,
  type Flair,
  type MediaKind,
  type Reaction,
} from "@midbig/shared";
import { mute } from "@/app/chat-actions";
import { castPollVote, followMember, reactToPost, saveTopic } from "@/app/social-actions";
import type { Poll, ReactionCount } from "@/lib/social";

// ---------------------------------------------------------------------------
// Photos

/**
 * Shrinks a photo in the browser before upload: the longest side to `max`
 * (or a centered crop to exactly w×h), re-encoded as WebP or JPEG. Drawing
 * it fresh also drops EXIF data such as GPS location. GIFs under the size
 * limit go up untouched so they keep moving.
 */
async function shrink(file: File, fit: { max: number } | { w: number; h: number }): Promise<Blob> {
  if (file.type === "image/gif" && file.size <= MEDIA_LIMITS.maxBytes && "max" in fit) return file;
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  let sx = 0;
  let sy = 0;
  let sw = bmp.width;
  let sh = bmp.height;
  let w: number;
  let h: number;
  if ("max" in fit) {
    const scale = Math.min(1, fit.max / Math.max(bmp.width, bmp.height));
    w = Math.round(bmp.width * scale);
    h = Math.round(bmp.height * scale);
  } else {
    ({ w, h } = fit);
    const want = w / h;
    if (sw / sh > want) {
      sw = Math.round(sh * want);
      sx = Math.round((bmp.width - sw) / 2);
    } else {
      sh = Math.round(sw / want);
      sy = Math.round((bmp.height - sh) / 2);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  bmp.close();
  const encode = (type: string, q: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, q));
  let out = await encode("image/webp", 0.85);
  if (!out || out.type !== "image/webp") out = await encode("image/jpeg", 0.85);
  if (out && out.size > MEDIA_LIMITS.maxBytes) out = await encode("image/jpeg", 0.7);
  if (!out) throw new Error("This browser couldn't read that photo.");
  return out;
}

async function upload(file: File, kind: MediaKind): Promise<{ id: string; url: string }> {
  const fit =
    kind === "avatar"
      ? { w: MEDIA_LIMITS.avatarSide, h: MEDIA_LIMITS.avatarSide }
      : kind === "banner"
        ? { w: MEDIA_LIMITS.bannerWidth, h: MEDIA_LIMITS.bannerHeight }
        : { max: MEDIA_LIMITS.postMaxSide };
  const blob = await shrink(file, fit);
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", blob, "photo");
  const res = await fetch("/api/media", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
  if (!res.ok || !data.id || !data.url) throw new Error(data.error ?? "That upload didn't work. Please try again.");
  return { id: data.id, url: data.url };
}

/** Photos being attached to a post or comment: pick, paste or drop them in. */
export function usePhotos() {
  const [items, setItems] = useState<{ id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const add = useCallback(
    async (files: FileList | File[]) => {
      setError("");
      const list = [...files].filter((f) => f.type.startsWith("image/"));
      const room = MEDIA_LIMITS.perPost - items.length - busy;
      if (list.length > room) setError(`Up to ${MEDIA_LIMITS.perPost} photos per post.`);
      for (const f of list.slice(0, Math.max(0, room))) {
        setBusy((n) => n + 1);
        try {
          const up = await upload(f, "post");
          setItems((xs) => (xs.length < MEDIA_LIMITS.perPost ? [...xs, up] : xs));
        } catch (err) {
          setError(err instanceof Error ? err.message : "That upload didn't work.");
        } finally {
          setBusy((n) => n - 1);
        }
      }
    },
    [items.length, busy],
  );
  return {
    ids: items.map((i) => i.id),
    items,
    busy: busy > 0,
    error,
    add,
    remove: (id: string) => setItems((xs) => xs.filter((x) => x.id !== id)),
    clear: () => setItems([]),
    /** Paste photos straight into a text box. */
    onPaste: (e: React.ClipboardEvent) => {
      const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void add(files);
      }
    },
    onDrop: (e: React.DragEvent) => {
      if (e.dataTransfer.files.length) {
        e.preventDefault();
        void add(e.dataTransfer.files);
      }
    },
  };
}

export type Photos = ReturnType<typeof usePhotos>;

/** The 📷 button and thumbnails under a post box. */
export function PhotoTray({ photos }: { photos: Photos }) {
  const input = useRef<HTMLInputElement>(null);
  const full = photos.items.length >= MEDIA_LIMITS.perPost;
  return (
    <div className="photo-tray">
      {photos.items.length > 0 && (
        <ul className="photo-thumbs">
          {photos.items.map((p) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" />
              <button type="button" aria-label="Remove photo" onClick={() => photos.remove(p.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn link small" disabled={full || photos.busy} onClick={() => input.current?.click()}>
        📷 {photos.busy ? "Uploading…" : full ? "4 photos max" : "Add photo"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void photos.add(e.target.files);
          e.target.value = "";
        }}
      />
      {photos.error && (
        <span className="form-error small" role="alert">
          {photos.error}
        </span>
      )}
    </div>
  );
}

/** Photos on a post: a grid, and a full-size view on click. */
export function Gallery({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open != null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  if (images.length === 0) return null;
  return (
    <>
      <div className={`gallery n${Math.min(images.length, 4)}`}>
        {images.map((src, i) => (
          <button key={src} type="button" className="gallery-item" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      <dialog ref={dialog} className="lightbox" onClose={() => setOpen(null)} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
        {open != null && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[open]} alt="" />
            <div className="lightbox-bar">
              {images.length > 1 && (
                <button type="button" className="btn secondary small" onClick={() => setOpen((open + images.length - 1) % images.length)}>
                  ← Back
                </button>
              )}
              <a className="btn secondary small" href={images[open]} target="_blank" rel="noopener">
                Full size
              </a>
              {images.length > 1 && (
                <button type="button" className="btn secondary small" onClick={() => setOpen((open + 1) % images.length)}>
                  Next →
                </button>
              )}
              <button type="button" className="btn small" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}

/** Profile photo or banner: upload, see it, remove it. */
export function ProfilePhotoSetting({ kind, current, name }: { kind: "avatar" | "banner"; current: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className={`photo-setting ${kind}`}>
      {kind === "avatar" ? (
        src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pfp" src={src} alt="" width={72} height={72} />
        ) : (
          <span className="pfp pfp-initial big" aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
        )
      ) : (
        <span className="banner-preview" style={src ? { backgroundImage: `url(${src})` } : undefined} aria-hidden />
      )}
      <span className="row-gap">
        <button type="button" className="btn secondary small" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : src ? "Change" : kind === "avatar" ? "Add a profile photo" : "Add a banner"}
        </button>
        {src && (
          <button
            type="button"
            className="btn link small danger-text"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await fetch(`/api/media?kind=${kind}`, { method: "DELETE" });
              setBusy(false);
              if (!res.ok) return setMsg("That didn't work. Please try again.");
              setSrc(null);
              setMsg("Removed.");
              router.refresh();
            }}
          >
            Remove
          </button>
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          setMsg("");
          try {
            const up = await upload(f, kind);
            setSrc(up.url);
            setMsg("Saved.");
            router.refresh();
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "That upload didn't work.");
          } finally {
            setBusy(false);
          }
        }}
      />
      {msg && (
        <span className="small muted" role="status">
          {msg}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons

function useLoginLink() {
  const path = usePathname();
  return `/login?next=${encodeURIComponent(path)}`;
}

/** Bookmark a topic to read later. */
export function SaveButton({ topicId, saved, signedIn }: { topicId: string; saved: boolean; signedIn: boolean }) {
  const [on, setOn] = useState(saved);
  const [pending, start] = useTransition();
  const login = useLoginLink();
  if (!signedIn) {
    return (
      <Link href={login} className="btn link small" title="Save for later">
        🔖 Save
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={`btn link small save${on ? " on" : ""}`}
      aria-pressed={on}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOn(!on);
          const r = await saveTopic(topicId, !on);
          if (!r.ok) setOn(on);
        })
      }
    >
      {on ? "🔖 Saved" : "🔖 Save"}
    </button>
  );
}

export function ShareButton({ path, title }: { path: string; title: string }) {
  const [note, setNote] = useState("");
  return (
    <button
      type="button"
      className="btn link small"
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            setNote("Link copied");
            setTimeout(() => setNote(""), 2000);
          }
        } catch {
          // Cancelled.
        }
      }}
    >
      ↗ {note || "Share"}
    </button>
  );
}

export function FollowButton({ userId, following, signedIn }: { userId: string; following: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const login = useLoginLink();
  if (!signedIn) {
    return (
      <Link href={login} className="btn small">
        + Follow
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`btn small${on ? " secondary" : ""}`}
        aria-pressed={on}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setOn(!on);
            const r = await followMember(userId, !on);
            if (!r.ok) {
              setOn(on);
              setError(r.error);
            } else router.refresh();
          })
        }
      >
        {on ? "Following" : "+ Follow"}
      </button>
      {error && (
        <span className="form-error small" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

/** Hides a member's posts, comments and chat messages for you. */
export function MuteButton({ userId, muted }: { userId: string; muted: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(muted);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn secondary small"
      aria-pressed={on}
      disabled={pending}
      title="Hides their posts, comments and chat messages for you. They aren't told."
      onClick={() =>
        start(async () => {
          const r = await mute(userId, !on);
          if (r.ok) {
            setOn(!on);
            router.refresh();
          }
        })
      }
    >
      {on ? "Unmute" : "Mute"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Reactions

export function Reactions({ postId, initial, signedIn, mine }: { postId: string; initial: ReactionCount[]; signedIn: boolean; mine: boolean }) {
  const [list, setList] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const login = useLoginLink();
  const toggle = (emoji: Reaction) =>
    start(async () => {
      const had = list.find((r) => r.emoji === emoji)?.mine ?? false;
      const before = list;
      const order = Object.keys(REACTIONS) as Reaction[];
      const next = list
        .map((r) => (r.emoji === emoji ? { ...r, n: r.n + (had ? -1 : 1), mine: !had } : r))
        .filter((r) => r.n > 0);
      if (!had && !next.some((r) => r.emoji === emoji)) next.push({ emoji, n: 1, mine: true });
      next.sort((a, b) => order.indexOf(a.emoji) - order.indexOf(b.emoji));
      setList(next);
      setPicking(false);
      const r = await reactToPost(postId, emoji, !had);
      if (!r.ok) setList(before);
    });
  return (
    <span className="reactions">
      {list.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`reaction${r.mine ? " on" : ""}`}
          aria-pressed={r.mine}
          disabled={pending || !signedIn}
          onClick={() => toggle(r.emoji)}
          title={`${REACTIONS[r.emoji]} ${r.n}`}
        >
          {REACTIONS[r.emoji]} {r.n}
        </button>
      ))}
      {!mine &&
        (signedIn ? (
          <span className="react-add">
            <button type="button" className="reaction add" aria-expanded={picking} aria-label="Add a reaction" onClick={() => setPicking((p) => !p)}>
              ☺+
            </button>
            {picking && (
              <span className="react-pick" role="menu">
                {(Object.keys(REACTIONS) as Reaction[]).map((e) => (
                  <button key={e} type="button" role="menuitem" onClick={() => toggle(e)} aria-label={e}>
                    {REACTIONS[e]}
                  </button>
                ))}
              </span>
            )}
          </span>
        ) : (
          list.length === 0 && (
            <Link href={login} className="reaction add" aria-label="Log in to react">
              ☺+
            </Link>
          )
        ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Polls

function closesIn(at: number): string {
  const h = Math.round((at - Date.now()) / 3600_000);
  if (h < 1) return "closes within the hour";
  if (h < 48) return `closes in ${h} hours`;
  return `closes in ${Math.round(h / 24)} days`;
}

export function PollView({ topicId, poll, signedIn }: { topicId: string; poll: Poll; signedIn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const login = useLoginLink();
  const showResults = poll.closed || (poll.mine != null && !changing);
  return (
    <div className="poll">
      <ul>
        {poll.options.map((o, i) => (
          <li key={i} className={poll.mine === i ? "mine" : undefined}>
            {showResults ? (
              <span className="poll-bar" style={{ ["--share" as string]: `${o.share}%` }}>
                <span>
                  {o.text} {poll.mine === i && <span aria-label="your vote">✓</span>}
                </span>
                <span className="num">{o.share}%</span>
              </span>
            ) : signedIn ? (
              <button
                type="button"
                className="btn secondary wide"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await castPollVote(topicId, i);
                    if (!r.ok) return setError(r.error);
                    setChanging(false);
                    router.refresh();
                  })
                }
              >
                {o.text}
              </button>
            ) : (
              <Link href={login} className="btn secondary wide">
                {o.text}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">
        {poll.total.toLocaleString("en-US")} {poll.total === 1 ? "vote" : "votes"} · {poll.closed ? "closed" : closesIn(poll.closesAt)}
        {!poll.closed && poll.mine != null && !changing && (
          <>
            {" · "}
            <button type="button" className="btn link small" onClick={() => setChanging(true)}>
              Change my vote
            </button>
          </>
        )}
      </p>
      {error && (
        <p className="form-error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The poll part of the new-topic form. */
export function PollEditor({ value, onChange }: { value: { options: string[]; hours: number } | null; onChange: (v: { options: string[]; hours: number } | null) => void }) {
  if (!value) {
    return (
      <button type="button" className="btn link small" onClick={() => onChange({ options: ["", ""], hours: POLL_LIMITS.defaultHours })}>
        🗳️ Add a poll
      </button>
    );
  }
  const set = (i: number, t: string) => onChange({ ...value, options: value.options.map((o, j) => (j === i ? t : o)) });
  return (
    <fieldset className="poll-editor">
      <legend className="small">Poll</legend>
      {value.options.map((o, i) => (
        <input key={i} value={o} maxLength={POLL_LIMITS.optionMax} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} onChange={(e) => set(i, e.target.value)} />
      ))}
      <p className="row-gap">
        {value.options.length < POLL_LIMITS.maxOptions && (
          <button type="button" className="btn link small" onClick={() => onChange({ ...value, options: [...value.options, ""] })}>
            + Option
          </button>
        )}
        <label className="small">
          Runs for{" "}
          <select value={value.hours} onChange={(e) => onChange({ ...value, hours: Number(e.target.value) })}>
            <option value={24}>1 day</option>
            <option value={72}>3 days</option>
            <option value={168}>1 week</option>
            <option value={336}>2 weeks</option>
          </select>
        </label>
        <button type="button" className="btn link small danger-text" onClick={() => onChange(null)}>
          Remove poll
        </button>
      </p>
    </fieldset>
  );
}

export function FlairPicker({ value, onChange }: { value: Flair | null; onChange: (f: Flair | null) => void }) {
  return (
    <fieldset className="flair-pick">
      <legend className="small">Flair (optional)</legend>
      {(Object.keys(FLAIRS) as Flair[]).map((f) => (
        <button key={f} type="button" className={`flair flair-${f}${value === f ? " on" : ""}`} aria-pressed={value === f} onClick={() => onChange(value === f ? null : f)}>
          {FLAIRS[f].emoji} {FLAIRS[f].label}
        </button>
      ))}
    </fieldset>
  );
}
