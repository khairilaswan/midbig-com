"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH, CHAT_NAME_RULE, REPORT_REASONS, type ChatMessage, type ReportReason } from "@midbig/shared";
import { deleteMyMessage, modBan, modRemove, mute, report, saveChatName } from "@/app/chat-actions";
import { liveStore, type RoomEvent } from "@/components/live";
import { Turnstile } from "@/components/turnstile";
import type { ChatState } from "@/lib/types";

const byId = (a: ChatMessage, b: ChatMessage) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

function merge(list: ChatMessage[], more: ChatMessage[]): ChatMessage[] {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of more) map.set(m.id, { ...map.get(m.id), ...m, held: m.held });
  return [...map.values()].sort(byId);
}

async function fetchRoom(room: string, extra = ""): Promise<ChatState> {
  const res = await fetch(`/api/chat?room=${encodeURIComponent(room)}${extra}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`chat load failed: ${res.status}`);
  return res.json();
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Message text with http(s) links made clickable (never followed by search engines). */
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="nofollow ugc noopener noreferrer">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function ChatRoom({ room, title, tall = false }: { room: string; title: string; tall?: boolean }) {
  const [state, setState] = useState<ChatState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [failed, setFailed] = useState(false);
  const [present, setPresent] = useState<number | null>(null);
  const [hasEarlier, setHasEarlier] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const latest = useRef<string | null>(null);
  latest.current = messages.at(-1)?.id ?? null;

  const load = useCallback(async () => {
    try {
      const s = await fetchRoom(room);
      setState(s);
      setMessages(s.messages);
      setHasEarlier(s.messages.length >= 50);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [room]);

  useEffect(() => {
    void load();
    return liveStore.joinRoom(room, (ev: RoomEvent) => {
      if (ev.type === "chat") setMessages((m) => merge(m, [ev.msg]));
      else if (ev.type === "chat-remove") setMessages((m) => m.filter((x) => !ev.ids.includes(x.id)));
      else if (ev.type === "presence") setPresent(ev.n);
      else if (ev.type === "reconnected") {
        const after = latest.current;
        fetchRoom(room, after ? `&after=${after}` : "")
          .then((s) => setMessages((m) => merge(m, s.messages)))
          .catch(() => {});
      }
    });
  }, [room, load]);

  // A new account becomes able to post after its first 10 minutes.
  const until = state?.me?.block?.reason === "new" ? state.me.block.until : null;
  useEffect(() => {
    if (!until) return;
    const t = setTimeout(() => void load(), Math.max(1000, until - Date.now() + 1000));
    return () => clearTimeout(t);
  }, [until, load]);

  // Follow new messages unless the reader has scrolled up.
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const earlier = async () => {
    const first = messages[0]?.id;
    if (!first) return;
    const el = list.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    const s = await fetchRoom(room, `&before=${first}`);
    stick.current = false;
    setHasEarlier(s.messages.length >= 50);
    setMessages((m) => merge(m, s.messages));
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  };

  const muted = new Set(state?.muted ?? []);
  const shown = messages.filter((m) => !muted.has(m.userId));
  const me = state?.me ?? null;

  return (
    <section className={`chat${tall ? " tall" : ""}`} aria-label={title}>
      <header className="chat-head">
        <h2>{title}</h2>
        {present != null && <span className="muted small">{present} here</span>}
      </header>
      <ol
        className="chat-list"
        ref={list}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {hasEarlier && (
          <li className="chat-earlier">
            <button type="button" className="btn link small" onClick={earlier}>
              Load earlier messages
            </button>
          </li>
        )}
        {!state && !failed && <li className="muted small">Loading chat…</li>}
        {failed && <li className="muted small">Chat didn&rsquo;t load. Refresh the page to try again.</li>}
        {state && shown.length === 0 && <li className="muted small">No messages yet. Say hello!</li>}
        {shown.map((m) => (
          <ChatLine
            key={m.id}
            m={m}
            me={me}
            onMuted={(userId) =>
              setState((s) => (s ? { ...s, muted: [...s.muted, userId] } : s))
            }
            onGone={(id) => setMessages((list) => list.filter((x) => x.id !== id))}
          />
        ))}
      </ol>
      {muted.size > 0 && (
        <p className="muted small chat-muted">
          {muted.size} muted {muted.size === 1 ? "person" : "people"} hidden ·{" "}
          <button
            type="button"
            className="btn link small"
            onClick={async () => {
              await Promise.all([...muted].map((id) => mute(id, false)));
              setState((s) => (s ? { ...s, muted: [] } : s));
            }}
          >
            Unmute all
          </button>
        </p>
      )}
      <Composer
        room={room}
        state={state}
        onPosted={(msg) => {
          stick.current = true;
          setMessages((m) => merge(m, [msg]));
        }}
        onReload={load}
      />
      <p className="chat-rules muted small">
        Be kind. No scams, wallet addresses, &ldquo;DM me&rdquo; or paid groups; those are held for a moderator.
        Nothing here is financial advice. <Link href="/rules">Community rules</Link>
      </p>
    </section>
  );
}

function ChatLine({
  m,
  me,
  onMuted,
  onGone,
}: {
  m: ChatMessage;
  me: ChatState["me"];
  onMuted: (userId: string) => void;
  onGone: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");
  const mine = me?.id === m.userId;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, gone = false) => {
    const r = await fn();
    if (!r.ok) return setNote(r.error ?? "That didn't work.");
    setNote(done);
    setReporting(false);
    if (gone) onGone(m.id);
  };

  return (
    <li className={`chat-msg${m.held ? " held" : ""}${m.badge ? " staff" : ""}`}>
      <div className="chat-meta">
        <strong className="chat-name">{m.name}</strong>
        {m.badge && <span className="badge staff-badge">{m.badge === "admin" ? "Admin" : "Mod"}</span>}
        <time className="muted small" dateTime={new Date(m.at).toISOString()} title={new Date(m.at).toLocaleString("en-US")}>
          {clock(m.at)}
        </time>
        {me && (
          <button
            type="button"
            className="chat-more"
            aria-label="Message options"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            ⋯
          </button>
        )}
      </div>
      <p className="chat-body">
        <Body text={m.body} />
      </p>
      {m.held && <p className="chat-held small">Only you can see this until a moderator checks it.</p>}
      {open && me && (
        <div className="chat-actions small">
          {mine ? (
            <button type="button" className="btn link small" onClick={() => run(() => deleteMyMessage(m.id), "Deleted.", true)}>
              Delete
            </button>
          ) : (
            <>
              <button type="button" className="btn link small" onClick={() => setReporting((r) => !r)}>
                Report
              </button>
              <button
                type="button"
                className="btn link small"
                onClick={async () => {
                  const r = await mute(m.userId, true);
                  if (r.ok) onMuted(m.userId);
                  else setNote(r.error);
                }}
              >
                Mute {m.name}
              </button>
            </>
          )}
          {me.canModerate && !mine && (
            <>
              <button type="button" className="btn link small danger-text" onClick={() => run(() => modRemove([m.id]), "Removed.", true)}>
                Remove
              </button>
              <button
                type="button"
                className="btn link small danger-text"
                onClick={() => run(() => modBan(m.userId, 24, "From chat"), "Banned for 24 hours.", true)}
              >
                Ban 24h
              </button>
            </>
          )}
          {reporting && (
            <span className="chat-reasons">
              Why?{" "}
              {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
                <button key={r} type="button" className="btn secondary small" onClick={() => run(() => report(m.id, r), "Thanks, a moderator will look.")}>
                  {REPORT_REASONS[r]}
                </button>
              ))}
            </span>
          )}
          {note && <span className="muted" role="status">{note}</span>}
        </div>
      )}
    </li>
  );
}

function Composer({
  room,
  state,
  onPosted,
  onReload,
}: {
  room: string;
  state: ChatState | null;
  onPosted: (m: ChatMessage) => void;
  onReload: () => Promise<void>;
}) {
  const path = usePathname();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captchaRound, setCaptchaRound] = useState(0);

  if (!state) return null;
  const block = state.me ? state.me.block : { reason: "login" as const };

  if (block?.reason === "login") {
    return (
      <p className="chat-composer notice small">
        <Link href={`/login?next=${encodeURIComponent(path)}`}>Log in</Link> or{" "}
        <Link href={`/signup?next=${encodeURIComponent(path)}`}>sign up</Link> to chat.
      </p>
    );
  }
  if (block?.reason === "banned") {
    return (
      <p className="chat-composer notice small">
        {block.until
          ? `A moderator paused your chat until ${new Date(block.until).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.`
          : "A moderator removed you from chat."}{" "}
        <Link href="/rules">Community rules</Link>
      </p>
    );
  }
  if (block?.reason === "new") {
    return (
      <p className="chat-composer notice small">
        Welcome! New accounts read along for 10 minutes before posting. You can post from {clock(block.until)}.
      </p>
    );
  }
  if (block?.reason === "name") return <ChatNameForm onSaved={onReload} />;

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, body: text, captcha: captcha ?? undefined }),
      });
      const r = (await res.json()) as { ok: true; msg: ChatMessage } | { ok: false; error: string; needCaptcha?: boolean };
      if (r.ok) {
        setText("");
        setNeedCaptcha(false);
        setCaptcha(null);
        onPosted(r.msg);
      } else {
        setError(r.error);
        if (r.needCaptcha) {
          setNeedCaptcha(true);
          setCaptcha(null);
          setCaptchaRound((n) => n + 1);
        }
      }
    } catch {
      setError("Couldn't send. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        aria-label="Message"
        placeholder={`Message as ${state.me?.name}`}
        rows={2}
        maxLength={CHAT_MAX_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
      />
      {needCaptcha && state.captchaSiteKey && <Turnstile key={captchaRound} siteKey={state.captchaSiteKey} onToken={setCaptcha} />}
      <div className="chat-send">
        {error ? (
          <span className="form-error small" role="alert">
            {error}
          </span>
        ) : (
          <span className="muted small">{text.length > CHAT_MAX_LENGTH - 100 ? `${CHAT_MAX_LENGTH - text.length} left` : ""}</span>
        )}
        <button className="btn small" disabled={busy || !text.trim() || (needCaptcha && !captcha)}>
          Send
        </button>
      </div>
    </form>
  );
}

export function ChatNameForm({ onSaved, current }: { onSaved: () => void | Promise<void>; current?: string | null }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return (
    <form
      className="chat-composer form"
      onSubmit={async (e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "");
        const r = await saveChatName(name);
        if (!r.ok) return setError(r.error);
        setError("");
        setDone(true);
        await onSaved();
      }}
    >
      <label>
        {current ? "Chat name" : "Pick a chat name"} <span className="muted">({CHAT_NAME_RULE})</span>
        <input name="name" defaultValue={current ?? ""} required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" autoComplete="off" />
      </label>
      {!current && <p className="muted small">Others see this name next to your messages. Your email stays private.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {done && current && <p className="muted small" role="status">Saved.</p>}
      <p>
        <button className="btn small">{current ? "Save" : "Start chatting"}</button>
      </p>
    </form>
  );
}
