import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { nextLevel, repLevel } from "@midbig/shared";
import { ago, AuthorLine } from "@/components/forum-list";
import { forumViewer, getProfile } from "@/lib/forum";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getProfile(decodeURIComponent((await params).name), null);
  if (!profile) return { title: "Member not found", robots: { index: false } };
  return {
    title: `${profile.name} on midbig`,
    description: profile.bio ?? `${profile.name}'s posts and reputation on midbig.`,
    alternates: { canonical: `/u/${encodeURIComponent(profile.name)}` },
    // Only established members' profiles are worth a search result; new ones attract spam.
    robots: profile.trusted ? undefined : { index: false },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { viewer } = await forumViewer();
  const profile = await getProfile(decodeURIComponent((await params).name), viewer);
  if (!profile) notFound();
  const next = nextLevel(profile.reputation);

  return (
    <div className="narrow profile">
      <h1 className="page-title">
        <AuthorLine author={profile} />
      </h1>
      {profile.bio && <p className="lede">{profile.bio}</p>}
      <dl className="stats">
        <div>
          <dt>Reputation</dt>
          <dd>
            {profile.reputation} <span className="muted small">· {repLevel(profile.reputation)}</span>
          </dd>
        </div>
        <div>
          <dt>Helpful votes received</dt>
          <dd>{profile.helpfulReceived}</dd>
        </div>
        <div>
          <dt>Topics · replies</dt>
          <dd>
            {profile.topics} · {profile.replies}
          </dd>
        </div>
        <div>
          <dt>Joined</dt>
          <dd>{new Date(profile.joined).toLocaleDateString("en-US", { dateStyle: "medium" })}</dd>
        </div>
      </dl>
      {viewer?.id === profile.id && (
        <p className="muted small">
          {next ? `${next.needs} more reputation to reach ${next.name}. ` : ""}
          Edit your bio on <Link href="/account#profile">your account page</Link>.
        </p>
      )}

      <section>
        <h2>Recent posts</h2>
        {profile.recent.length === 0 ? (
          <p className="muted">No forum posts yet.</p>
        ) : (
          <ol className="profile-posts">
            {profile.recent.map((p) => (
              <li key={p.id}>
                <Link href={`${p.topicPath}${p.isFirst ? "" : `#p${p.id}`}`}>{p.isFirst ? p.topicTitle : `Re: ${p.topicTitle}`}</Link>
                <p className="muted small">
                  {p.body.length > 200 ? `${p.body.slice(0, 200)}…` : p.body}
                </p>
                <p className="muted small">
                  {ago(p.createdAt)}
                  {p.helpful > 0 ? ` · 👍 ${p.helpful}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
