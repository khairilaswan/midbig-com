import type { Metadata } from "next";
import { ChangePasswordForm, DeleteAccountForm, SignOutButton } from "@/components/account-settings";
import { PushToggle } from "@/components/push-toggle";
import { requireSession } from "@/lib/auth";
import { pool } from "@/lib/server";
import { vapidKeys } from "@/lib/user-data";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await requireSession("/account");
  const [accounts, keys] = await Promise.all([
    pool().query<{ providerId: string }>(`SELECT "providerId" FROM "account" WHERE "userId" = $1`, [user.id]),
    vapidKeys().catch(() => null),
  ]);
  const hasPassword = accounts.rows.some((a) => a.providerId === "credential");

  return (
    <div className="narrow">
      <h1 className="page-title">Your account</h1>
      <p className="lede">
        Logged in as <strong>{user.email}</strong>
      </p>

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
