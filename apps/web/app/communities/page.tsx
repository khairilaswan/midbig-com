import type { Metadata } from "next";
import Link from "next/link";
import { NAMESPACES, type Namespace } from "@midbig/shared";
import { listCommunities } from "@/lib/communities";
import { forumViewer } from "@/lib/forum";

export const metadata: Metadata = {
  title: "All communities: b/ for main assets, m/ for smaller coins",
  description: "Browse midbig's trading communities: one for every major coin, stock and forex pair, plus member-made ones for smaller coins.",
  alternates: { canonical: "/communities" },
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ns?: string; q?: string; sort?: string; page?: string }> };

const PER_PAGE = 60;

export default async function CommunitiesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const ns: Namespace = sp.ns === "m" ? "m" : "b";
  const q = sp.q?.trim().slice(0, 50) ?? "";
  const sort = sp.sort === "new" || sp.sort === "active" ? sp.sort : "members";
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, { viewer }] = await Promise.all([
    listCommunities({ ns, q, sort, limit: PER_PAGE + 1, offset: (page - 1) * PER_PAGE }),
    forumViewer(),
  ]);
  const href = (p: Record<string, string>) => {
    const u = new URLSearchParams({ ...(ns === "m" ? { ns } : {}), ...(q ? { q } : {}), ...(sort !== "members" ? { sort } : {}), ...p });
    for (const [k, v] of [...u]) if (!v) u.delete(k);
    const s = u.toString();
    return s ? `/communities?${s}` : "/communities";
  };

  return (
    <div className="forum">
      <div className="page-head">
        <h1 className="page-title">Communities</h1>
        {viewer && (viewer.verified || viewer.role === "admin") && (
          <Link href="/communities/new" className="btn">
            Create a community
          </Link>
        )}
      </div>
      <nav className="tabs" aria-label="Namespace">
        {(["b", "m"] as const).map((n) => (
          <Link key={n} href={n === "b" ? "/communities" : "/communities?ns=m"} aria-current={ns === n ? "page" : undefined}>
            {n}/ {NAMESPACES[n].name}
          </Link>
        ))}
      </nav>
      <p className="lede small">{NAMESPACES[ns].blurb}</p>
      <form className="row-gap community-search" action="/communities">
        {ns === "m" && <input type="hidden" name="ns" value="m" />}
        <input name="q" defaultValue={q} placeholder="Find a coin, ticker or pair" aria-label="Search communities" />
        <select name="sort" defaultValue={sort} aria-label="Sort">
          <option value="members">Most members</option>
          <option value="active">Recently active</option>
          <option value="new">Newest</option>
        </select>
        <button className="btn small">Search</button>
      </form>
      {list.length === 0 ? (
        <p className="muted">
          {q ? "No community matches that." : ns === "m" ? "No m/ communities yet." : "No communities yet."}{" "}
          {ns === "m" && !viewer?.verified && "Verified members can create m/ communities for smaller coins."}
        </p>
      ) : (
        <ul className="category-grid">
          {list.slice(0, PER_PAGE).map((c) => (
            <li key={c.id}>
              <Link href={c.path} className="category-card community-card">
                <span className="row-gap">
                  {c.image ? <img src={c.image} alt="" width={22} height={22} className="logo" /> : null}
                  <strong>{c.label}</strong>
                  <span className="muted small">{c.title}</span>
                </span>
                {c.description && <span className="muted small clamp">{c.description}</span>}
                <span className="muted small">
                  {c.memberCount.toLocaleString("en-US")} {c.memberCount === 1 ? "member" : "members"} · {c.topicCount.toLocaleString("en-US")} {c.topicCount === 1 ? "topic" : "topics"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || list.length > PER_PAGE) && (
        <nav className="pager" aria-label="Pages">
          {page > 1 ? <Link href={href({ page: page === 2 ? "" : String(page - 1) })}>← Back</Link> : <span />}
          <span className="muted small">Page {page}</span>
          {list.length > PER_PAGE ? <Link href={href({ page: String(page + 1) })}>More →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
