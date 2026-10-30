"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ChatNameForm } from "@/components/chat";

export function ChatNameSetting({ current }: { current: string | null }) {
  const router = useRouter();
  if (!current) {
    return (
      <>
        <p className="muted">You&rsquo;ll pick a name the first time you chat. Or pick one now:</p>
        <ChatNameForm onSaved={() => router.refresh()} />
      </>
    );
  }
  return <ChatNameForm current={current} onSaved={() => router.refresh()} />;
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn secondary"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}

export function ChangePasswordForm() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setBusy(true);
        const { error } = await authClient.changePassword({
          currentPassword: String(f.get("current")),
          newPassword: String(f.get("new")),
          revokeOtherSessions: true,
        });
        setBusy(false);
        if (error) return setMsg(error.code === "INVALID_PASSWORD" ? "Your current password is wrong." : error.message || "That didn't work.");
        form.reset();
        setMsg("Password changed. Other devices are logged out.");
      }}
    >
      <label>
        Current password
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        New password <span className="muted">(8 characters or more)</span>
        <input name="new" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
      </label>
      {msg && <p className="muted small" role="status">{msg}</p>}
      <button className="btn secondary" disabled={busy}>
        Change password
      </button>
    </form>
  );
}

export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  if (!open) {
    return (
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        Delete my account…
      </button>
    );
  }
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const { error } = await authClient.deleteUser(hasPassword ? { password: String(f.get("password")) } : {});
        if (error) return setMsg(error.message || "That didn't work. Log out and back in, then try again.");
        router.push("/");
        router.refresh();
      }}
    >
      <p>
        This deletes your account, watchlist, portfolio, alerts and chat messages for good. It can&rsquo;t be undone.
      </p>
      {hasPassword && (
        <label>
          Type your password to confirm
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
      )}
      {msg && <p className="form-error">{msg}</p>}
      <p className="row-gap">
        <button className="btn danger">Delete everything</button>
        <button type="button" className="btn link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </p>
    </form>
  );
}
