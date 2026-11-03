import Link from "next/link";
import { CommunityAdminRow, DefaultsForm } from "@/components/admin";
import { communityMods, listCommunities } from "@/lib/communities";

type Props = { searchParams: Promise<{ q?: string; ns?: string }> };

export default async function AdminCommunities({ searchParams }: Props) {
  const sp = await searchParams;
  const ns = sp.ns === "b" || sp.ns === "m" ? sp.ns : undefined;
  const list = await listCommunities({ ns, q: sp.q, sort: "new", limit: 100, includeSuspended: true });
  const mods = await Promise.all(list.map((c) => communityMods(c.id)));

  return (
    <>
      <section className="panel">
        <h2>Default b/ communities</h2>
        <p className="small muted">
          Creates b/ communities for the biggest listed coins and stocks, and for forex pairs, that don&rsquo;t have one
          yet. Names follow the rule: coin name for crypto (b/bitcoin), ticker for stocks (b/AAPL), pair for forex
          (b/eurusd). Stocks and forex need the Finnhub key, so they appear once their prices load.
        </p>
        <DefaultsForm />
        <p className="small">
          <Link href="/communities/new">Create one by hand</Link> (a b/ asset or topic hub, or an m/ community).
        </p>
      </section>

      <section>
        <h2>All communities</h2>
        <form className="row-gap community-search" action="/admin/communities">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, title or ticker" aria-label="Search" />
          <select name="ns" defaultValue={ns ?? ""} aria-label="Namespace">
            <option value="">b/ and m/</option>
            <option value="b">b/ only</option>
            <option value="m">m/ only</option>
          </select>
          <button className="btn small">Search</button>
        </form>
        <p className="small muted">Newest first, up to 100. Suspended communities are hidden from members.</p>
        <ul className="admin-list">
          {list.map((c, i) => (
            <li key={c.id} className={c.status === "suspended" ? "suspended" : undefined}>
              <div>
                <Link href={c.path}>
                  <strong>{c.label}</strong>
                </Link>{" "}
                <span className="muted small">
                  {c.title} · {c.kind} · {c.memberCount} members · {c.topicCount} topics · created{" "}
                  {new Date(c.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  {c.status === "suspended" && " · SUSPENDED"}
                </span>
                {mods[i]!.length > 0 && <div className="small">Mods: {mods[i]!.map((m) => m.name).join(", ")}</div>}
                {c.tokenInfo.contract && <div className="small mono">{c.tokenInfo.chain ?? "?"}: {c.tokenInfo.contract}</div>}
              </div>
              <CommunityAdminRow id={c.id} status={c.status} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
