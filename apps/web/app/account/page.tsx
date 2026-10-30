import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm, ChatNameSetting, DeleteAccountForm, SignOutButton } from "@/components/account-settings";
import { PushToggle } from "@/components/push-toggle";
import { TwoFactorSettings } from "@/components/two-factor";
import { requireSession } from "@/lib/auth";
import { getViewer } from "@/lib/chat";
import { pool } from "@/lib/server";
import { vapidKeys } from "@/lib/user-data";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await requireSession("/account");
  const [accounts, keys, viewer] = await Promise.all([
    pool().query<{ providerId: string }>(`SELECT "providerId" FROM "account" WHERE "userId" = $1`, [user.id]),
    vapidKeys().catch(() => null),
    getViewer(user.id),
  ]);
  const hasPassword = accounts.rows.some((a) => a.providerId === "credential");

  return (
    <div className="narrow">
      <h1 className="page-title">Your account</h1>
      <p className="lede">
        Logged in as <strong>{user.email}</strong>
      </p>

      {viewer?.isStaff && (
        <p className="notice">
          You&rsquo;re {viewer.role === "admin" ? "an admin" : "a moderator"}. <Link href="/mod">Open the moderation queue</Link>
        </p>
      )}

      <section className="panel">
        <h2>Chat name</h2>
        <ChatNameSetting current={viewer?.chatName ?? null} />
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
          Download everything we store about you: your account details, watchlist, portfolio, alerts and chat messages.
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
