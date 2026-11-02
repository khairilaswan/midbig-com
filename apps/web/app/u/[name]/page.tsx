import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { nextLevel, profilePath, repLevel } from "@midbig/shared";
import { Avatar } from "@/components/avatar";
import { ago, AuthorLine } from "@/components/forum-list";
import { FollowButton, MuteButton } from "@/components/social";
import { forumViewer, getProfile } from "@/lib/forum";
import { followList, profileExtras } from "@/lib/social";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ name: string }>; searchParams: Promise<{ tab?: string }> };

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

export default async function ProfilePage({ params, searchParams }: Props) {
  const { viewer } = await forumViewer();
  const profile = await getProfile(decodeURIComponent((await params).name), viewer);
  if (!profile) notFound();
  const tab = (await searchParams).tab;
  const list = tab === "followers" || tab === "following" ? tab : null;
  const [extras, people] = await Promise.all([profileExtras(profile, viewer?.id), list ? followList(profile.id, list) : null]);
  const next = nextLevel(profile.reputation);
  const self = viewer?.id === profile.id;
  const base = profilePath(profile.name);

  return (
    <div className="narrow profile">
      <div className="profile-banner" style={extras.banner ? { backgroundImage: `url(${extras.banner})` } : undefined} />
      <header className="profile-head">
        <Avatar name={profile.name} src={profile.avatar} size={96} />
        <div className="profile-id">
          <h1 className="page-title">
            <AuthorLine author={profile} avatar={false} />
          </h1>
          <p className="small">
            <Link href={`${base}?tab=followers`}>
              <strong>{extras.followers.toLocaleString("en-US")}</strong> {extras.followers === 1 ? "follower" : "followers"}
            </Link>
            {" · "}
            <Link href={`${base}?tab=following`}>
              <strong>{extras.following.toLocaleString("en-US")}</strong> following
            </Link>
          </p>
        </div>
        <span className="row-gap profile-actions">
          {self ? (
            <Link href="/account#profile" className="btn secondary small">
              Edit profile
            </Link>
          ) : (
            profile.badge !== "bot" && (
              <>
                <FollowButton userId={profile.id} following={extras.followed} signedIn={viewer != null} />
                {viewer && <MuteButton userId={profile.id} muted={extras.muted} />}
              </>
            )
          )}
        </span>
      </header>
      {profile.bio && <p className="lede">{profile.bio}</p>}
      {extras.badges.length > 0 && (
        <ul className="badge-row" aria-label="Badges">
          {extras.badges.map((b) => (
            <li key={b.id} title={b.hint}>
              <span aria-hidden>{b.emoji}</span> {b.label}
            </li>
          ))}
        </ul>
      )}
      <dl className="stats">
        <div>
          <dt>Reputation</dt>
          <dd>
            {profile.reputation} <span className="muted small">· {repLevel(profile.reputation)}</span>
          </dd>
        </div>
        <div>
          <dt>Net votes received</dt>
          <dd>{profile.scoreReceived}</dd>
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
      {self && (
        <p className="muted small">
          {next ? `${next.needs} more reputation to reach ${next.name}. ` : ""}
          Edit your bio on <Link href="/account#profile">your account page</Link>.
        </p>
      )}

      {people && (
        <section>
          <h2>
            {list === "followers" ? "Followers" : "Following"} <Link href={base} className="small">← Back to posts</Link>
          </h2>
          {people.length === 0 ? (
            <p className="muted">{list === "followers" ? "No followers yet." : "Not following anyone yet."}</p>
          ) : (
            <ul className="people">
              {people.map((p) => (
                <li key={p.id}>
                  <Link href={profilePath(p.name)}>
                    <Avatar name={p.name} src={p.avatar} size={32} /> {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
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
                {p.images.length > 0 && (
                  <span className="profile-thumbs">
                    {p.images.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="" loading="lazy" />
                    ))}
                  </span>
                )}
                <p className="muted small">
                  {ago(p.createdAt)}
                  {` · ${p.score >= 0 ? "▲" : "▼"} ${p.score}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
