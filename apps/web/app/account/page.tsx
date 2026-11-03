import type { Metadata } from "next";
import Link from "next/link";
import { mediaUrl, profilePath, repLevel, type MediaType } from "@midbig/shared";
import { ChangePasswordForm, ChatNameSetting, DeleteAccountForm, SignOutButton } from "@/components/account-settings";
import { BioSetting } from "@/components/forum";
import { PushToggle } from "@/components/push-toggle";
import { ProfilePhotoSetting } from "@/components/social";
import { TwoFactorSettings } from "@/components/two-factor";
import { requireSession } from "@/lib/auth";
import { getViewer } from "@/lib/chat";
import { pool } from "@/lib/server";
import { vapidKeys } from "@/lib/user-data";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await requireSession("/account");
  const [accounts, keys, viewer, bio] = await Promise.all([
    pool().query<{ providerId: string }>(`SELECT "providerId" FROM "account" WHERE "userId" = $1`, [user.id]),
    vapidKeys().catch(() => null),
    getViewer(user.id),
    pool().query<{ bio: string | null; avatar_id: string | null; avatar_mime: MediaType | null; banner_id: string | null; banner_mime: MediaType | null }>(
      `SELECT bio, avatar_id, (SELECT mime FROM media WHERE id = avatar_id) AS avatar_mime,
         banner_id, (SELECT mime FROM media WHERE id = banner_id) AS banner_mime
       FROM "user" WHERE id = $1`,
      [user.id],
    ),
  ]);
  const hasPassword = accounts.rows.some((a) => a.providerId === "credential");
  const me = bio.rows[0];
  const avatar = me?.avatar_id && me.avatar_mime ? mediaUrl(me.avatar_id, me.avatar_mime) : null;
  const banner = me?.banner_id && me.banner_mime ? mediaUrl(me.banner_id, me.banner_mime) : null;

  return (
    <div className="narrow">
      <h1 className="page-title">Your account</h1>
      <p className="lede">
        Logged in as <strong>{user.email}</strong>
      </p>

      {viewer?.isStaff && (
        <p className="notice">
          You&rsquo;re {viewer.role === "admin" ? "an admin" : "a moderator"}. <Link href="/mod">Open the moderation queue</Link>
          {viewer.role === "admin" && (
            <>
              {" · "}
              <Link href="/admin">Admin portal</Link>
            </>
          )}
        </p>
      )}

      <section className="panel" id="profile">
        <h2>Public name and profile</h2>
        <ChatNameSetting current={viewer?.chatName ?? null} />
        {viewer?.chatName && (
          <>
            <p className="muted small">
              Shown in chat and the forum. Reputation {viewer.reputation} ({repLevel(viewer.reputation)}) ·{" "}
              <Link href={profilePath(viewer.chatName)}>See your profile</Link>
            </p>
            <BioSetting current={me?.bio ?? null} />
            <h3>Profile photo</h3>
            <ProfilePhotoSetting kind="avatar" current={avatar} name={viewer.chatName} />
            <h3>Banner</h3>
            <p className="muted small">A wide picture across the top of your profile (shown at 3:1).</p>
            <ProfilePhotoSetting kind="banner" current={banner} name={viewer.chatName} />
            <p className="muted small">
              Photos are public. No faces of other people without their OK, and nothing from the{" "}
              <Link href="/rules">community rules</Link>&rsquo; banned list.
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Appearance</h2>
        <p className="muted">Theme style, color, light or dark, and your home page template.</p>
        <p className="row-gap">
          <Link href="/settings/appearance" className="btn secondary">
            Change appearance
          </Link>
          <Link href="/forum?feed=saved">🔖 Saved posts</Link>
          <Link href="/notifications">🔔 Notifications</Link>
        </p>
      </section>

      <section className="panel">
        <h2>Notifications</h2>
        <p className="muted">Price alerts arrive as notifications on each device you turn them on for.</p>
        <PushToggle publicKey={keys?.publicKey ?? null} />
      </section>

      {hasPassword && (
        <section className="panel">
          <h2>Password</h2>
          <ChangePasswordForm />
        </section>
      )}

      <section className="panel" id="two-factor">
        <h2>Two-factor login</h2>
        <TwoFactorSettings enabled={Boolean(viewer?.twoFactor)} hasPassword={hasPassword} />
        {!hasPassword && (
          <p className="muted small">
            You log in with Google, so Google&rsquo;s own two-step check protects your login. Turning this on here is
            still needed for moderator tools.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Your data</h2>
        <p className="muted">
          Download everything we store about you: your account details, watchlist, portfolio, alerts, chat messages and forum posts.
        </p>
        <p className="row-gap">
          <a className="btn secondary" href="/api/account/export" download>
            Download my data
          </a>
          <Link href="/privacy-choices">Privacy choices</Link>
        </p>
      </section>

      <section className="panel">
        <h2>Log out</h2>
        <SignOutButton />
      </section>

      <section className="panel">
        <h2>Delete account</h2>
        <DeleteAccountForm hasPassword={hasPassword} />
      </section>
    </div>
  );
}
