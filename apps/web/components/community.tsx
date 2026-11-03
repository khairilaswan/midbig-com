"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { COMMUNITY_LIMITS, normalizeSlug } from "@midbig/shared";
import { editCommunity, joinCommunity, newCommunity } from "@/app/community-actions";

export function JoinButton({ communityId, joined, role, signedIn }: { communityId: string; joined: boolean; role: "member" | "mod" | null; signedIn: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const [on, setOn] = useState(joined);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn small">
        Join
      </Link>
    );
  }
  if (role === "mod") return <span className="badge">Moderator</span>;
  return (
    <span>
      <button
        type="button"
        className={`btn small${on ? " secondary" : ""}`}
        disabled={pending}
        aria-pressed={on}
        onClick={() =>
          start(async () => {
            const next = !on;
            setOn(next);
            const r = await joinCommunity(communityId, next);
            if (!r.ok) {
              setOn(!next);
              setError(r.error);
            } else router.refresh();
          })
        }
      >
        {on ? "Joined ✓" : "Join"}
      </button>
      {error && (
        <span className="form-error small" role="alert">
          {" "}
          {error}
        </span>
      )}
    </span>
  );
}

/** Admins and the community's moderators edit its description and rules; admins also its name. */
export function CommunityEditForm({
  community,
  isAdmin,
}: {
  community: { id: string; slug: string; title: string; description: string | null; rules: string | null };
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn link small" onClick={() => setOpen(true)}>
        Edit community
      </button>
    );
  }
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        const r = await editCommunity(community.id, {
          description: String(f.get("description") ?? ""),
          rules: String(f.get("rules") ?? ""),
          ...(isAdmin ? { title: String(f.get("title") ?? ""), slug: String(f.get("slug") ?? "") } : {}),
        });
        setBusy(false);
        if (!r.ok) return setMsg(r.error);
        setMsg("Saved.");
        setOpen(false);
        router.refresh();
      }}
    >
      {isAdmin && (
        <>
          <label>
            Name in the URL
            <input name="slug" defaultValue={community.slug} required maxLength={50} />
          </label>
          <label>
            Title
            <input name="title" defaultValue={community.title} required maxLength={COMMUNITY_LIMITS.titleMax} />
          </label>
        </>
      )}
      <label>
        Description
        <textarea name="description" rows={3} defaultValue={community.description ?? ""} maxLength={COMMUNITY_LIMITS.descriptionMax} />
      </label>
      <label>
        Community rules <span className="muted">(one per line)</span>
        <textarea name="rules" rows={5} defaultValue={community.rules ?? ""} maxLength={COMMUNITY_LIMITS.rulesMax} />
      </label>
      {msg && (
        <p className="form-error" role="alert">
          {msg}
        </p>
      )}
      <p className="row-gap">
        <button className="btn small" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn link small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </p>
    </form>
  );
}

/**
 * Creating a community. Members (verified) make m/ ones for coins that
 * aren't listed or don't have a b/ community. Admins also make b/ ones and
 * topic hubs.
 */
export function CreateCommunityForm({
  isAdmin,
  listed,
}: {
  isAdmin: boolean;
  /** Listed assets that don't have a community yet, for the picker. */
  listed: { id: string; label: string; cls: string }[];
}) {
  const router = useRouter();
  const [ns, setNs] = useState<"b" | "m">(isAdmin ? "b" : "m");
  const [mode, setMode] = useState<"listed" | "token" | "hub">(isAdmin ? "listed" : "token");
  const [slug, setSlug] = useState("");
  const [assetId, setAssetId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = listed.filter((a) => isAdmin || a.cls === "crypto");

  return (
    <form
      className="form panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        const r = await newCommunity({
          ns,
          slug,
          title: String(f.get("title") ?? ""),
          symbol: String(f.get("symbol") ?? ""),
          description: String(f.get("description") ?? ""),
          assetId: mode === "listed" ? assetId : null,
          hub: mode === "hub",
          hubClass: String(f.get("hubClass") ?? "") || null,
          chain: String(f.get("chain") ?? ""),
          contract: String(f.get("contract") ?? ""),
          website: String(f.get("website") ?? ""),
        });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        router.push(r.path);
      }}
    >
      {isAdmin && (
        <fieldset className="seg">
          <legend className="small">Namespace</legend>
          {(["b", "m"] as const).map((n) => (
            <button key={n} type="button" className={ns === n ? "on" : ""} aria-pressed={ns === n} onClick={() => setNs(n)}>
              {n}/ {n === "b" ? "(main)" : "(smaller coins)"}
            </button>
          ))}
        </fieldset>
      )}
      <fieldset className="seg">
        <legend className="small">What is it about?</legend>
        <button type="button" className={mode === "token" ? "on" : ""} aria-pressed={mode === "token"} onClick={() => setMode("token")}>
          A coin we don&rsquo;t list
        </button>
        <button type="button" className={mode === "listed" ? "on" : ""} aria-pressed={mode === "listed"} onClick={() => setMode("listed")}>
          A listed {isAdmin ? "asset" : "coin"}
        </button>
        {isAdmin && ns === "b" && (
          <button type="button" className={mode === "hub" ? "on" : ""} aria-pressed={mode === "hub"} onClick={() => setMode("hub")}>
            A topic hub
          </button>
        )}
      </fieldset>

      {mode === "listed" && (
        <label>
          Asset
          <select
            value={assetId}
            required
            onChange={(e) => {
              setAssetId(e.target.value);
              const a = choices.find((x) => x.id === e.target.value);
              if (a && !slug) setSlug(a.id.startsWith("stock-") ? a.id.slice(6).replace(/-/g, "") : a.id.startsWith("fx-") ? a.id.slice(3).replace(/-/g, "") : a.id);
            }}
          >
            <option value="">Pick one…</option>
            {choices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Name ({ns}/…)
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onBlur={() => setSlug((s) => normalizeSlug(s))}
          required
          maxLength={50}
          placeholder={mode === "hub" ? "general" : "pepe"}
          autoComplete="off"
        />
      </label>
      <p className="muted small">
        {ns}/{normalizeSlug(slug) || "…"}. Use the coin&rsquo;s name. Names of listed coins, stocks and pairs are kept for
        their b/ community.
      </p>
      <label>
        Title
        <input name="title" required maxLength={COMMUNITY_LIMITS.titleMax} placeholder={mode === "hub" ? "General" : "Pepe"} />
      </label>
      {mode === "token" && (
        <>
          <label>
            Ticker
            <input name="symbol" required maxLength={COMMUNITY_LIMITS.symbolMax} placeholder="PEPE" />
          </label>
          <label>
            Chain <span className="muted">(optional)</span>
            <input name="chain" maxLength={40} placeholder="Ethereum, Solana, Base…" />
          </label>
          <label>
            Contract address <span className="muted">(optional)</span>
            <input name="contract" maxLength={100} autoComplete="off" />
          </label>
          <label>
            Website <span className="muted">(optional, https://)</span>
            <input name="website" type="url" maxLength={200} />
          </label>
        </>
      )}
      {mode === "hub" && (
        <label>
          Hidden when this category is off
          <select name="hubClass" defaultValue="">
            <option value="">None (always shown)</option>
            <option value="crypto">Crypto</option>
            <option value="stock">Stocks</option>
            <option value="forex">Forex</option>
          </select>
        </label>
      )}
      <label>
        Description <span className="muted">(optional)</span>
        <textarea name="description" rows={3} maxLength={COMMUNITY_LIMITS.descriptionMax} />
      </label>
      {!isAdmin && (
        <p className="muted small">
          You&rsquo;ll moderate it. Members can report it, and midbig can suspend communities that promote scams or
          pump-and-dumps. <Link href="/rules#communities">Community rules</Link>
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p>
        <button className="btn" disabled={busy}>
          {busy ? "Creating…" : "Create community"}
        </button>
      </p>
    </form>
  );
}
