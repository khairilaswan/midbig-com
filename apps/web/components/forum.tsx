"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FORUM_CATEGORIES,
  FORUM_LIMITS,
  REPORT_REASONS,
  type ForumCategory,
  type ReportReason,
} from "@midbig/shared";
import type { ActionResult } from "@/app/actions";
import { modBan } from "@/app/chat-actions";
import {
  deletePost,
  modForumRemove,
  modTopicFlag,
  postReply,
  reportForumPost,
  saveBio,
  startTopic,
  updatePost,
  voteHelpful,
} from "@/app/forum-actions";
import type { WriteResult } from "@/lib/forum";
import type { ForumMe, ForumPost, PostBlock } from "@/lib/types";
import { ChatNameForm } from "./chat";
import { AuthorLine } from "./forum-list";
import { PostText } from "./post-body";
import { Turnstile } from "./turnstile";

function when(at: number): string {
  return new Date(at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function BlockNotice({ block, what }: { block: PostBlock; what: string }) {
  const path = usePathname();
  const router = useRouter();
  if (block.reason === "login") {
    return (
      <p className="notice small">
        <Link href={`/login?next=${encodeURIComponent(path)}`}>Log in</Link> or{" "}
        <Link href={`/signup?next=${encodeURIComponent(path)}`}>sign up</Link> to {what}.
      </p>
    );
  }
  if (block.reason === "banned") {
    return (
      <p className="notice small">
        {block.until ? `A moderator paused your posting until ${when(block.until)}.` : "A moderator removed you from posting."}{" "}
        <Link href="/rules">Community rules</Link>
      </p>
    );
  }
  if (block.reason === "new") {
    return (
      <p className="notice small">
        Welcome! New accounts read along for 10 minutes before posting. You can post from{" "}
        {new Date(block.until).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
      </p>
    );
  }
  return <ChatNameForm onSaved={() => router.refresh()} />;
}

/** The first-post bot check, when the server asks for it. */
function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [needed, setNeeded] = useState(false);
  const [round, setRound] = useState(0);
  return {
    token,
    blocked: needed && !token,
    onResult(r: WriteResult) {
      if (!r.ok && r.needCaptcha) {
        setNeeded(true);
        setToken(null);
        setRound((n) => n + 1);
      } else if (r.ok) setNeeded(false);
    },
    widget: (siteKey: string | null) =>
      needed && siteKey ? <Turnstile key={round} siteKey={siteKey} onToken={setToken} /> : null,
  };
}

export function TopicForm({
  me,
  captchaSiteKey,
  category,
  asset,
}: {
  me: ForumMe | null;
  captchaSiteKey: string | null;
  category: ForumCategory | null;
  asset: { id: string; name: string; symbol: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const captcha = useCaptcha();
  const block = me ? me.block : { reason: "login" as const };
  if (block) return <BlockNotice block={block} what="start a topic" />;

  return (
    <form
      className="form panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        const r = await startTopic({
          category: String(f.get("category")),
          assetId: asset?.id ?? null,
          title: String(f.get("title")),
          body,
          captcha: captcha.token ?? undefined,
        });
        captcha.onResult(r);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        router.push(r.path);
      }}
    >
      <label>
        Category
        <select name="category" defaultValue={category ?? (asset ? (asset.id.startsWith("stock-") ? "stocks" : asset.id.startsWith("fx-") ? "forex" : "crypto") : "general")}>
          {(Object.keys(FORUM_CATEGORIES) as ForumCategory[]).map((c) => (
            <option key={c} value={c}>
              {FORUM_CATEGORIES[c].name}
            </option>
          ))}
        </select>
      </label>
      {asset && (
        <p className="muted small">
          About <strong>{asset.name}</strong> ({asset.symbol}). It will show on its page too.
        </p>
      )}
      <label>
        Title
        <input name="title" required minLength={FORUM_LIMITS.titleMin} maxLength={FORUM_LIMITS.titleMax} autoComplete="off" />
      </label>
      <label>
        Your post
        <textarea
          rows={10}
          required
          maxLength={FORUM_LIMITS.topicMax}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your reasoning and sources. Leave a blank line between paragraphs."
        />
      </label>
      <p className="muted small">
        No signals, wallet addresses, group invites or &ldquo;DM me&rdquo;; posts like that wait for a moderator. Nothing
        here is financial advice. <Link href="/rules">Community rules</Link>
      </p>
      {captcha.widget(captchaSiteKey)}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p>
        <button className="btn" disabled={busy || captcha.blocked}>
          {busy ? "Posting…" : "Post topic"}
        </button>
      </p>
    </form>
  );
}

export function ReplyForm({
  topicId,
  me,
  captchaSiteKey,
  locked,
}: {
  topicId: string;
  me: ForumMe | null;
  captchaSiteKey: string | null;
  locked: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const captcha = useCaptcha();
  const block = me ? me.block : { reason: "login" as const };
  if (locked && !me?.canModerate) return <p className="notice small">This topic is locked. No new replies.</p>;
  if (block) return <BlockNotice block={block} what="reply" />;

  return (
    <form
      className="form reply-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNote("");
        const r = await postReply({ topicId, body, captcha: captcha.token ?? undefined });
        captcha.onResult(r);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setBody("");
        if (r.held) setNote("Your reply is waiting for a moderator. Only you can see it until then.");
        router.push(r.path);
        router.refresh();
      }}
    >
      <label>
        Reply
        <textarea rows={5} required maxLength={FORUM_LIMITS.replyMax} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {captcha.widget(captchaSiteKey)}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="muted small" role="status">
          {note}
        </p>
      )}
      <p>
        <button className="btn small" disabled={busy || !body.trim() || captcha.blocked}>
          {busy ? "Posting…" : "Post reply"}
        </button>
      </p>
    </form>
  );
}

export function PostView({
  post,
  me,
  title,
  topic,
}: {
  post: ForumPost;
  me: ForumMe | null;
  /** The topic's title, for editing an opening post. */
  title?: string;
  topic?: { id: string; pinned: boolean; locked: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [voted, setVoted] = useState(post.votedByMe);
  const [helpful, setHelpful] = useState(post.helpful);

  const run = (fn: () => Promise<ActionResult>, done: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setNote(r.error);
      setNote(done);
      setReporting(false);
      after?.();
      router.refresh();
    });

  const canVote = me && !post.mine && post.status === "visible";

  return (
    <article id={`p${post.id}`} className={`post${post.status !== "visible" ? " held" : ""}`}>
      <div className="post-meta">
        <AuthorLine author={post.author} />
        <span className="muted small">
          {when(post.createdAt)}
          {post.editedAt && " · edited"}
        </span>
      </div>
      {editing ? (
        <EditForm post={post} title={title} onDone={() => setEditing(false)} />
      ) : (
        <PostText text={post.body} />
      )}
      {post.status === "held" && (
        <p className="chat-held small">
          {post.mine ? "Only you and moderators can see this until a moderator checks it." : "Held for review."}
        </p>
      )}
      {post.status === "removed" && <p className="chat-held small">Removed. Only moderators see this.</p>}
      <div className="post-actions small">
        <button
          type="button"
          className={`btn secondary small helpful${voted ? " on" : ""}`}
          aria-pressed={voted}
          disabled={!canVote || pending}
          title={post.mine ? "Your post" : me ? "Mark as helpful" : "Log in to vote"}
          onClick={() => {
            const on = !voted;
            setVoted(on);
            setHelpful((h) => h + (on ? 1 : -1));
            start(async () => {
              const r = await voteHelpful(post.id, on);
              if (!r.ok) {
                setVoted(!on);
                setHelpful((h) => h + (on ? -1 : 1));
                setNote(r.error);
              }
            });
          }}
        >
          👍 Helpful{helpful > 0 ? ` · ${helpful}` : ""}
        </button>
        {me && (
          <button type="button" className="btn link small" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            ⋯
          </button>
        )}
        {menu && me && (
          <>
            {post.canEdit && !editing && (
              <button type="button" className="btn link small" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            {post.mine && post.status !== "removed" && (
              <button
                type="button"
                className="btn link small danger-text"
                disabled={pending}
                onClick={() =>
                  run(() => deletePost(post.id), "Deleted.", () => {
                    if (post.isFirst) router.push("/forum");
                  })
                }
              >
                Delete{post.isFirst ? " topic" : ""}
              </button>
            )}
            {!post.mine && (
              <button type="button" className="btn link small" onClick={() => setReporting((r) => !r)}>
                Report
              </button>
            )}
            {me.canModerate && !post.mine && post.status !== "removed" && (
              <>
                <button type="button" className="btn link small danger-text" disabled={pending} onClick={() => run(() => modForumRemove([post.id]), "Removed.")}>
                  Remove
                </button>
                <button
                  type="button"
                  className="btn link small danger-text"
                  disabled={pending}
                  onClick={() => run(() => modBan(post.author.id, 24, "From the forum"), "Banned for 24 hours.")}
                >
                  Ban 24h
                </button>
              </>
            )}
            {me.canModerate && topic && (
              <>
                <button type="button" className="btn link small" disabled={pending} onClick={() => run(() => modTopicFlag(topic.id, "pinned", !topic.pinned), topic.pinned ? "Unpinned." : "Pinned.")}>
                  {topic.pinned ? "Unpin" : "Pin"}
                </button>
                <button type="button" className="btn link small" disabled={pending} onClick={() => run(() => modTopicFlag(topic.id, "locked", !topic.locked), topic.locked ? "Unlocked." : "Locked.")}>
                  {topic.locked ? "Unlock" : "Lock"}
                </button>
              </>
            )}
          </>
        )}
        {reporting && (
          <span className="chat-reasons">
            Why?{" "}
            {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
              <button key={r} type="button" className="btn secondary small" disabled={pending} onClick={() => run(() => reportForumPost(post.id, r), "Thanks, a moderator will look.")}>
                {REPORT_REASONS[r]}
              </button>
            ))}
          </span>
        )}
        {note && (
          <span className="muted" role="status">
            {note}
          </span>
        )}
      </div>
    </article>
  );
}

function EditForm({ post, title, onDone }: { post: ForumPost; title?: string; onDone: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState(post.body);
  const [t, setT] = useState(title ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await updatePost(post.id, body, post.isFirst ? t : undefined);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        onDone();
        router.refresh();
      }}
    >
      {post.isFirst && (
        <label>
          Title
          <input value={t} onChange={(e) => setT(e.target.value)} minLength={FORUM_LIMITS.titleMin} maxLength={FORUM_LIMITS.titleMax} required />
        </label>
      )}
      <textarea
        aria-label="Post"
        rows={8}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={post.isFirst ? FORUM_LIMITS.topicMax : FORUM_LIMITS.replyMax}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="row-gap">
        <button className="btn small" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn link small" onClick={onDone}>
          Cancel
        </button>
      </p>
    </form>
  );
}

export function BioSetting({ current }: { current: string | null }) {
  const [bio, setBio] = useState(current ?? "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await saveBio(bio);
        setError(!r.ok);
        setMsg(r.ok ? "Saved." : r.error);
      }}
    >
      <label>
        About you <span className="muted">(shown on your profile, no links)</span>
        <textarea rows={2} maxLength={FORUM_LIMITS.bioMax} value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      {msg && (
        <p className={error ? "form-error" : "muted small"} role={error ? "alert" : "status"}>
          {msg}
        </p>
      )}
      <p>
        <button className="btn small">Save</button>
      </p>
    </form>
  );
}
