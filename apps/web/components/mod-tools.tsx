"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assetPath, FILTER_REASON_LABELS, parseRoom, REPORT_REASONS, type ChatRole } from "@midbig/shared";
import { adminSetModerator, modApprove, modBan, modRemove, modUnban } from "@/app/chat-actions";
import { modForumApprove, modForumRemove } from "@/app/forum-actions";
import type { ActionResult } from "@/app/actions";
import type { QueueItem } from "@/lib/chat";
import type { ForumQueueItem } from "@/lib/types";

function roomLink(room: string) {
  const r = parseRoom(room);
  if (!r) return room;
  if (r.kind === "global") return <Link href="/chat">Everyone</Link>;
  return r.kind === "coin" ? <Link href={assetPath(r.assetId)}>{r.assetId}</Link> : <span>community #{r.communityId}</span>;
}

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? "" : r.error);
      router.refresh();
    });
  return { run, pending, error };
}

export function ModQueue({ items }: { items: QueueItem[] }) {
  const { run, pending, error } = useAction();
  const held = items.filter((i) => i.status === "held");
  return (
    <section className="panel">
      <h2>Chat queue ({items.length})</h2>
      {error && <p className="form-error">{error}</p>}
      {items.length === 0 && <p className="muted">Nothing waiting. Nice.</p>}
      {held.length > 1 && (
        <p className="row-gap">
          <button type="button" className="btn secondary small" disabled={pending} onClick={() => run(() => modRemove(held.map((i) => i.id)))}>
            Remove all {held.length} held
          </button>
        </p>
      )}
      <ol className="mod-queue">
        {items.map((m) => (
          <li key={m.id} className="mod-item">
            <div className="chat-meta small">
              <strong>{m.name}</strong>
              <span className="muted">
                joined {ago(m.authorJoined)} ago · {m.authorMessages} messages · in {roomLink(m.room)} ·{" "}
                {new Date(m.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            <p className="chat-body">{m.body}</p>
            <p className="small">
              {m.status === "held" ? (
                <span className="badge">{m.heldBy === "reports" ? "Hidden by reports" : "Held by filter"}</span>
              ) : (
                <span className="badge">Visible, reported</span>
              )}{" "}
              {m.flags.map((f) => FILTER_REASON_LABELS[f] ?? f).join(", ")}
              {m.reports.length > 0 && (
                <span className="muted">
                  {m.flags.length > 0 ? " · " : ""}
                  Reports: {m.reports.map((r) => `${REPORT_REASONS[r.reason] ?? r.reason} ×${r.n}`).join(", ")}
                </span>
              )}
            </p>
            <p className="row-gap">
              <button type="button" className="btn secondary small" disabled={pending} onClick={() => run(() => modApprove([m.id]))}>
                {m.status === "held" ? "Approve" : "Keep it"}
              </button>
              <button type="button" className="btn danger small" disabled={pending} onClick={() => run(() => modRemove([m.id]))}>
                Remove
              </button>
              <button type="button" className="btn danger small" disabled={pending} onClick={() => run(() => modBan(m.userId, 24, m.body.slice(0, 120)))}>
                Remove + ban 24h
              </button>
              <button type="button" className="btn danger small" disabled={pending} onClick={() => run(() => modBan(m.userId, null, m.body.slice(0, 120)))}>
                Ban for good
              </button>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ForumQueue({ items }: { items: ForumQueueItem[] }) {
  const { run, pending, error } = useAction();
  const held = items.filter((i) => i.status === "held");
  return (
    <section className="panel">
      <h2>Forum queue ({items.length})</h2>
      {error && <p className="form-error">{error}</p>}
      {items.length === 0 && <p className="muted">Nothing waiting.</p>}
      {held.length > 1 && (
        <p className="row-gap">
          <button type="button" className="btn secondary small" disabled={pending} onClick={() => run(() => modForumRemove(held.map((i) => i.id)))}>
            Remove all {held.length} held
          </button>
        </p>
      )}
      <ol className="mod-queue">
        {items.map((p) => (
          <li key={p.id} className="mod-item">
            <div className="chat-meta small">
              <strong>{p.author.name}</strong>
              <span className="muted">
                joined {ago(p.authorJoined)} ago · {p.authorPosts} posts · rep {p.author.reputation} ·{" "}
                {p.isFirst ? "new topic" : "comment in"} <Link href={`${p.topicPath}#p${p.id}`}>{p.topicTitle}</Link> ({p.communityLabel}) ·{" "}
                {new Date(p.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            <p className="chat-body">{p.body.length > 1200 ? `${p.body.slice(0, 1200)}…` : p.body}</p>
            <p className="small">
              {p.status === "held" ? (
                <span className="badge">{p.heldBy === "reports" ? "Hidden by reports" : "Held by filter"}</span>
              ) : (
                <span className="badge">Visible, reported</span>
              )}{" "}
              {p.flags.map((f) => FILTER_REASON_LABELS[f] ?? f).join(", ")}
              {p.reports.length > 0 && (
                <span className="muted">
                  {p.flags.length > 0 ? " · " : ""}
                  Reports: {p.reports.map((r) => `${REPORT_REASONS[r.reason] ?? r.reason} ×${r.n}`).join(", ")}
                </span>
              )}
            </p>
            <p className="row-gap">
              <button type="button" className="btn secondary small" disabled={pending} onClick={() => run(() => modForumApprove([p.id]))}>
                {p.status === "held" ? "Approve" : "Keep it"}
              </button>
              <button type="button" className="btn danger small" disabled={pending} onClick={() => run(() => modForumRemove([p.id]))}>
                Remove
              </button>
              <button type="button" className="btn danger small" disabled={pending} onClick={() => run(() => modBan(p.author.id, 24, p.body.slice(0, 120)))}>
                Remove + ban 24h
              </button>
              <button type="button" className="btn danger small" disabled={pending} onClick={() => run(() => modBan(p.author.id, null, p.body.slice(0, 120)))}>
                Ban for good
              </button>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function BanList({ bans }: { bans: { userId: string; name: string; until: number | null; reason: string | null }[] }) {
  const { run, pending, error } = useAction();
  return (
    <section className="panel">
      <h2>Banned from chat and forum ({bans.length})</h2>
      {error && <p className="form-error">{error}</p>}
      {bans.length === 0 && <p className="muted">Nobody.</p>}
      <ul className="mod-list">
        {bans.map((b) => (
          <li key={b.userId}>
            <strong>{b.name}</strong>{" "}
            <span className="muted small">
              {b.until ? `until ${new Date(b.until).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : "for good"}
              {b.reason ? ` · “${b.reason}”` : ""}
            </span>{" "}
            <button type="button" className="btn link small" disabled={pending} onClick={() => run(() => modUnban(b.userId))}>
              Unban
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StaffList({
  staff,
}: {
  staff: { id: string; email: string; name: string | null; role: ChatRole; twoFactor: boolean }[];
}) {
  const { run, pending, error } = useAction();
  const [who, setWho] = useState("");
  return (
    <section className="panel">
      <h2>Moderators</h2>
      <p className="muted small">
        Moderators can approve, remove and ban. They need two-factor login turned on before the tools work. Admins come
        from the ADMIN_EMAILS setting.
      </p>
      <ul className="mod-list">
        {staff.map((s) => (
          <li key={s.id}>
            <strong>{s.name ?? s.email}</strong> <span className="muted small">{s.email} · {s.role}</span>{" "}
            {!s.twoFactor && <span className="badge">2FA off</span>}{" "}
            {s.role === "moderator" && (
              <button type="button" className="btn link small" disabled={pending} onClick={() => run(() => adminSetModerator(s.email, false))}>
                Remove moderator
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="row-gap"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await adminSetModerator(who, true);
            if (r.ok) setWho("");
            return r;
          });
        }}
      >
        <input aria-label="Email or chat name" placeholder="Email or chat name" value={who} onChange={(e) => setWho(e.target.value)} />
        <button className="btn small" disabled={pending || !who.trim()}>
          Make moderator
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
