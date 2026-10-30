"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  buildTree,
  COLLAPSE_SCORE,
  FORUM_LIMITS,
  MAX_DEPTH,
  REPORT_REASONS,
  type CommentSort,
  type ReportReason,
  type Stance,
} from "@midbig/shared";
import type { ActionResult } from "@/app/actions";
import { modBan } from "@/app/chat-actions";
import {
  communityRemove,
  deletePost,
  modTopicFlag,
  postReply,
  reportForumPost,
  saveBio,
  startTopic,
  updatePost,
} from "@/app/forum-actions";
import type { WriteResult } from "@/lib/forum";
import type { ForumMe, ForumPost, PostBlock } from "@/lib/types";
import { ChatNameForm } from "./chat";
import { AuthorLine } from "./forum-list";
import { PostText } from "./post-body";
import { Turnstile } from "./turnstile";
import { VoteButtons } from "./votes";

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
  community,
  choices,
}: {
  me: ForumMe | null;
  captchaSiteKey: string | null;
  /** The community the form was opened from, if any. */
  community: { id: string; label: string; title: string } | null;
  /** Every community the member can post in, for the picker. */
  choices: { id: string; label: string; title: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [where, setWhere] = useState(community?.label ?? "");
  const [stance, setStance] = useState<Stance | null>(null);
  const captcha = useCaptcha();
  const block = me ? me.block : { reason: "login" as const };
  if (block) return <BlockNotice block={block} what="start a topic" />;

  const target = choices.find((c) => c.label.toLowerCase() === where.trim().toLowerCase().replace(/^mb\//, "b/"));

  return (
    <form
      className="form panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (!target) return setError("Pick a community from the list, like b/bitcoin or b/AAPL.");
        setBusy(true);
        setError("");
        const r = await startTopic({
          communityId: target.id,
          title: String(f.get("title")),
          body,
          stance,
          captcha: captcha.token ?? undefined,
        });
        captcha.onResult(r);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        router.push(r.path);
      }}
    >
      <label>
        Community
        <input
          list="community-choices"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="b/bitcoin, b/AAPL, b/eurusd, m/…"
          autoComplete="off"
          required
        />
        <datalist id="community-choices">
          {choices.map((c) => (
            <option key={c.id} value={c.label}>
              {c.title}
            </option>
          ))}
        </datalist>
      </label>
      {target && <p className="muted small">Posting in {target.label} ({target.title}).</p>}
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
          placeholder="Share your reasoning and sources. Tag assets like $BTC or $AAPL. Ask a bot with @pricebot $NVDA. Leave a blank line between paragraphs."
        />
      </label>
      <fieldset className="stance-pick">
        <legend className="small">Your call (optional; feeds the community&rsquo;s bull/bear gauge)</legend>
        {(["bull", "bear"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`btn secondary small stance ${s}${stance === s ? " on" : ""}`}
            aria-pressed={stance === s}
            onClick={() => setStance(stance === s ? null : s)}
          >
            {s === "bull" ? "▲ Bullish" : "▼ Bearish"}
          </button>
        ))}
      </fieldset>
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

export function CommentForm({
  topicId,
  parentId = null,
  me,
  captchaSiteKey,
  locked,
  onDone,
  autoFocus = false,
}: {
  topicId: string;
  /** The comment answered; null for a top-level comment. */
  parentId?: string | null;
  me: ForumMe | null;
  captchaSiteKey: string | null;
  locked: boolean;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const captcha = useCaptcha();
  const block = me ? me.block : { reason: "login" as const };
  if (locked && !me?.canModerate) return <p className="notice small">This topic is locked. No new comments.</p>;
  if (block) return <BlockNotice block={block} what="comment" />;

  return (
    <form
      className={`form reply-form${parentId ? " nested" : ""}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNote("");
        const r = await postReply({ topicId, parentId, body, captcha: captcha.token ?? undefined });
        captcha.onResult(r);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setBody("");
        if (r.held) setNote("Your comment is waiting for a moderator. Only you can see it until then.");
        onDone?.();
        router.refresh();
      }}
    >
      <label className={parentId ? "sr-only" : undefined}>
        {parentId ? "Reply" : "Add a comment"}
      </label>
      <textarea
        aria-label={parentId ? "Reply" : "Comment"}
        rows={parentId ? 3 : 5}
        required
        autoFocus={autoFocus}
        maxLength={FORUM_LIMITS.replyMax}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={parentId ? "Write a reply…" : "What do you think? Tag $TICKERS, or ask @pricebot, @riskbot or @pulsebot."}
      />
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
      <p className="row-gap">
        <button className="btn small" disabled={busy || !body.trim() || captcha.blocked}>
          {busy ? "Posting…" : parentId ? "Reply" : "Comment"}
        </button>
        {onDone && (
          <button type="button" className="btn link small" onClick={onDone}>
            Cancel
          </button>
        )}
      </p>
    </form>
  );
}

/** The ⋯ menu shared by the opening post and comments: edit, delete, report, and moderator tools. */
function PostMenu({
  post,
  me,
  topic,
  onEdit,
  onNote,
}: {
  post: ForumPost;
  me: ForumMe;
  topic?: { id: string; pinned: boolean; locked: boolean; communityPath: string };
  onEdit: () => void;
  onNote: (s: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const run = (fn: () => Promise<ActionResult>, done: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return onNote(r.error);
      onNote(done);
      setReporting(false);
      after?.();
      router.refresh();
    });
  const isBot = post.author.badge === "bot";
  return (
    <>
      <button type="button" className="btn link small" aria-expanded={open} aria-label="More" onClick={() => setOpen((m) => !m)}>
        ⋯
      </button>
      {open && (
        <>
          {post.canEdit && (
            <button type="button" className="btn link small" onClick={onEdit}>
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
                  if (post.isFirst && topic) router.push(topic.communityPath);
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
            <button type="button" className="btn link small danger-text" disabled={pending} onClick={() => run(() => communityRemove(post.id), "Removed.")}>
              Remove
            </button>
          )}
          {me.isSiteMod && !post.mine && !isBot && post.status !== "removed" && (
            <button
              type="button"
              className="btn link small danger-text"
              disabled={pending}
              onClick={() => run(() => modBan(post.author.id, 24, "From the forum"), "Banned for 24 hours.")}
            >
              Ban 24h
            </button>
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
    </>
  );
}

function HeldNote({ post }: { post: ForumPost }) {
  if (post.status === "held") {
    return (
      <p className="chat-held small">
        {post.mine ? "Only you and moderators can see this until a moderator checks it." : "Held for review."}
      </p>
    );
  }
  return post.status === "removed" && post.body ? <p className="chat-held small">Removed. Only moderators see this.</p> : null;
}

/** The opening post of a topic. */
export function PostView({
  post,
  me,
  title,
  topic,
}: {
  post: ForumPost;
  me: ForumMe | null;
  title: string;
  topic: { id: string; pinned: boolean; locked: boolean; communityPath: string };
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  return (
    <article id={`p${post.id}`} className={`post opening${post.status !== "visible" ? " held" : ""}`}>
      <div className="post-meta">
        <AuthorLine author={post.author} />
        <span className="muted small">
          {when(post.createdAt)}
          {post.editedAt && " · edited"}
        </span>
      </div>
      {editing ? <EditForm post={post} title={title} onDone={() => setEditing(false)} /> : <PostText text={post.body} />}
      <HeldNote post={post} />
      <div className="post-actions small">
        <VoteButtons postId={post.id} score={post.score} myVote={post.myVote} me={me} mine={post.mine} />
        <a href="#comments" className="btn link small">
          💬 Comment
        </a>
        {me && <PostMenu post={post} me={me} topic={topic} onEdit={() => setEditing(true)} onNote={setNote} />}
        {note && (
          <span className="muted" role="status">
            {note}
          </span>
        )}
      </div>
    </article>
  );
}

type Node = ForumPost & { children: Node[] };

/** Every comment under a topic as a tree, sorted best, new or old. Heavily downvoted ones start folded. */
export function CommentTree({
  comments,
  me,
  topicId,
  locked,
  captchaSiteKey,
  sort,
}: {
  comments: ForumPost[];
  me: ForumMe | null;
  topicId: string;
  locked: boolean;
  captchaSiteKey: string | null;
  sort: CommentSort;
}) {
  const tree = buildTree(comments, sort) as Node[];
  if (tree.length === 0) return <p className="muted">No comments yet. Be the first.</p>;
  return (
    <ol className="comments">
      {tree.map((n) => (
        <Comment key={n.id} node={n} me={me} topicId={topicId} locked={locked} captchaSiteKey={captchaSiteKey} />
      ))}
    </ol>
  );
}

function countAll(n: Node): number {
  return n.children.reduce((s, c) => s + 1 + countAll(c), 0);
}

function Comment({
  node,
  me,
  topicId,
  locked,
  captchaSiteKey,
}: {
  node: Node;
  me: ForumMe | null;
  topicId: string;
  locked: boolean;
  captchaSiteKey: string | null;
}) {
  const sunk = node.score <= COLLAPSE_SCORE;
  const [open, setOpen] = useState(!sunk);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const placeholder = node.status === "removed" && !node.body;
  return (
    <li id={`p${node.id}`} className={`comment${node.status !== "visible" ? " held" : ""}${node.author.badge === "bot" ? " bot" : ""}`}>
      <div className="comment-meta small">
        <button type="button" className="fold" aria-expanded={open} aria-label={open ? "Fold" : "Unfold"} onClick={() => setOpen((o) => !o)}>
          {open ? "–" : "+"}
        </button>
        <AuthorLine author={node.author} />
        <span className="muted">
          {when(node.createdAt)}
          {node.editedAt && " · edited"}
        </span>
        {!open && (
          <span className="muted">
            {sunk ? `folded: ${node.score} points` : "folded"}
            {countAll(node) > 0 ? ` · ${countAll(node)} more` : ""}
          </span>
        )}
      </div>
      {open && (
        <div className="comment-body">
          {placeholder ? (
            <p className="muted small">[removed]</p>
          ) : editing ? (
            <EditForm post={node} onDone={() => setEditing(false)} />
          ) : (
            <PostText text={node.body} />
          )}
          <HeldNote post={node} />
          {!placeholder && (
            <div className="post-actions small">
              <VoteButtons postId={node.id} score={node.score} myVote={node.myVote} me={me} mine={node.mine} compact />
              {node.status === "visible" && !locked && (
                <button type="button" className="btn link small" onClick={() => setReplying((r) => !r)}>
                  Reply
                </button>
              )}
              {me && <PostMenu post={node} me={me} onEdit={() => setEditing(true)} onNote={setNote} />}
              {note && (
                <span className="muted" role="status">
                  {note}
                </span>
              )}
            </div>
          )}
          {replying && (
            <CommentForm
              topicId={topicId}
              parentId={node.id}
              me={me}
              captchaSiteKey={captchaSiteKey}
              locked={locked}
              autoFocus
              onDone={() => setReplying(false)}
            />
          )}
          {node.children.length > 0 && (
            <ol className={`comments${node.depth + 1 >= MAX_DEPTH - 1 ? " flat" : ""}`}>
              {node.children.map((c) => (
                <Comment key={c.id} node={c} me={me} topicId={topicId} locked={locked} captchaSiteKey={captchaSiteKey} />
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
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
