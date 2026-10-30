"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BOT_KINDS, type BotKind } from "@midbig/shared";
import type { ActionResult } from "@/app/actions";
import {
  adminCommunityMod,
  adminCommunityStatus,
  adminCreateBot,
  adminCreateDefaults,
  adminSetCategory,
  adminUpdateBot,
  adminVerify,
} from "@/app/admin-actions";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const run = (fn: () => Promise<ActionResult>, done = "") =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? done : r.error);
      if (r.ok) router.refresh();
    });
  return { run, pending, msg, setMsg };
}

const LABELS = { crypto: "Crypto", stock: "Stocks", forex: "Forex" } as const;

export function CategoryToggles({ on }: { on: Record<"crypto" | "stock" | "forex", boolean> }) {
  const { run, pending, msg } = useAction();
  return (
    <div>
      <ul className="toggles">
        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
          <li key={k}>
            <label className="switch">
              <input type="checkbox" checked={on[k]} disabled={pending} onChange={(e) => run(() => adminSetCategory(k, e.target.checked), "Saved.")} />
              <span>{LABELS[k]}</span>
              <span className={`small ${on[k] ? "up-text" : "muted"}`}>{on[k] ? "On" : "Off"}</span>
            </label>
          </li>
        ))}
      </ul>
      {msg && (
        <p className="small muted" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

export function DefaultsForm() {
  const { run, pending, msg, setMsg } = useAction();
  return (
    <form
      className="form row-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setMsg("");
        run(async () => {
          const r = await adminCreateDefaults({ crypto: Number(f.get("crypto")), stock: Number(f.get("stock")), forex: Number(f.get("forex")) });
          if (r.ok) setTimeout(() => setMsg(`Created ${r.made} communities.`), 0);
          return r;
        });
      }}
    >
      <label>
        Top coins
        <input name="crypto" type="number" min={0} max={500} defaultValue={100} />
      </label>
      <label>
        Top stocks
        <input name="stock" type="number" min={0} max={600} defaultValue={100} />
      </label>
      <label>
        Forex pairs
        <input name="forex" type="number" min={0} max={100} defaultValue={30} />
      </label>
      <button className="btn small" disabled={pending}>
        {pending ? "Creating…" : "Create missing b/ communities"}
      </button>
      {msg && (
        <span className="small muted" role="status">
          {msg}
        </span>
      )}
    </form>
  );
}

export function CommunityAdminRow({ id, status }: { id: string; status: "active" | "suspended" }) {
  const { run, pending, msg } = useAction();
  const [who, setWho] = useState("");
  return (
    <div className="row-gap small">
      <button
        type="button"
        className={`btn small ${status === "active" ? "danger" : "secondary"}`}
        disabled={pending}
        onClick={() => run(() => adminCommunityStatus(id, status === "active" ? "suspended" : "active"))}
      >
        {status === "active" ? "Suspend" : "Restore"}
      </button>
      <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="email or public name" aria-label="Moderator" className="small-input" />
      <button type="button" className="btn secondary small" disabled={pending || !who.trim()} onClick={() => run(() => adminCommunityMod(id, who, true), "Moderator added.")}>
        Add mod
      </button>
      <button type="button" className="btn link small" disabled={pending || !who.trim()} onClick={() => run(() => adminCommunityMod(id, who, false), "Moderator removed.")}>
        Remove mod
      </button>
      {msg && <span className="muted">{msg}</span>}
    </div>
  );
}

export function VerifyButton({ userId, verified }: { userId: string; verified: boolean }) {
  const { run, pending, msg } = useAction();
  return (
    <span className="row-gap">
      <button type="button" className={`btn small ${verified ? "secondary" : ""}`} disabled={pending} onClick={() => run(() => adminVerify(userId, !verified))}>
        {verified ? "Unverify" : "Verify"}
      </button>
      {msg && <span className="small form-error">{msg}</span>}
    </span>
  );
}

export function BotForm({
  bot,
}: {
  bot?: { userId: string; handle: string; kind: BotKind; description: string; persona: string | null; enabled: boolean; dailyCap: number };
}) {
  const { run, pending, msg } = useAction();
  const [kind, setKind] = useState<BotKind>(bot?.kind ?? "price");
  return (
    <form
      className="form bot-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const input = {
          handle: String(f.get("handle") ?? ""),
          kind,
          description: String(f.get("description") ?? ""),
          persona: String(f.get("persona") ?? ""),
          dailyCap: Number(f.get("dailyCap")),
          enabled: f.get("enabled") === "on",
        };
        run(() => (bot ? adminUpdateBot(bot.userId, input) : adminCreateBot(input)), bot ? "Saved." : "Bot created.");
      }}
    >
      {!bot && (
        <>
          <label>
            Handle (members type @handle)
            <input name="handle" required pattern="[A-Za-z0-9_]{3,20}" placeholder="newsbot" />
          </label>
          <label>
            What it does
            <select value={kind} onChange={(e) => setKind(e.target.value as BotKind)}>
              {(Object.keys(BOT_KINDS) as BotKind[]).map((k) => (
                <option key={k} value={k}>
                  {BOT_KINDS[k].name}: {BOT_KINDS[k].blurb}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Description (shown on its profile)
        <input name="description" required maxLength={200} defaultValue={bot?.description ?? ""} />
      </label>
      {kind === "ai" && (
        <label>
          Voice and focus <span className="muted">(optional, for the AI)</span>
          <textarea name="persona" rows={3} maxLength={1000} defaultValue={bot?.persona ?? ""} placeholder="A calm risk manager who focuses on position sizing." />
        </label>
      )}
      <label>
        Replies per day, at most
        <input name="dailyCap" type="number" min={0} max={100000} defaultValue={bot?.dailyCap ?? (kind === "ai" ? 50 : 500)} />
      </label>
      {bot && (
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={bot.enabled} /> Switched on
        </label>
      )}
      <p className="row-gap">
        <button className="btn small" disabled={pending}>
          {bot ? "Save" : "Create bot"}
        </button>
        {msg && <span className="small muted">{msg}</span>}
      </p>
    </form>
  );
}
