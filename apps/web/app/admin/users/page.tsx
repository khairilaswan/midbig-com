import Link from "next/link";
import { profilePath } from "@midbig/shared";
import { VerifyButton } from "@/components/admin";
import { searchUsers } from "@/lib/admin";

type Props = { searchParams: Promise<{ q?: string }> };

export default async function AdminUsers({ searchParams }: Props) {
  const q = (await searchParams).q ?? "";
  const users = await searchUsers(q);
  return (
    <section>
      <p className="small muted">
        Verified members get a ✓ next to their name and can create m/ communities. Payments and identity checks are
        on hold, so verification is your call for now. Moderators are managed on the <Link href="/mod">moderation page</Link>.
      </p>
      <form className="row-gap community-search" action="/admin/users">
        <input name="q" defaultValue={q} placeholder="Email or public name" aria-label="Search members" />
        <button className="btn small">Search</button>
      </form>
      <div className="table-wrap">
        <table className="market admin-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th className="num">Reputation</th>
              <th className="num">Posts</th>
              <th>Joined</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name ? <Link href={profilePath(u.name)}>{u.name}</Link> : <span className="muted">no name</span>}
                  <div className="small muted">{u.email}</div>
                  {u.banned && <span className="badge">Banned</span>}
                </td>
                <td>{u.role}</td>
                <td className="num">{u.reputation}</td>
                <td className="num">{u.posts}</td>
                <td>{new Date(u.joined).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                <td>
                  <VerifyButton userId={u.id} verified={u.verified} />
                  {u.communities > 0 && <div className="small muted">{u.communities} m/ made</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && <p className="muted">Nobody matches that.</p>}
    </section>
  );
}
