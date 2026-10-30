"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AccountMenu() {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <div className="account-menu" aria-hidden />;
  if (!data) {
    return (
      <div className="account-menu">
        <Link href="/login">Log in</Link>
        <Link href="/signup" className="btn small">
          Sign up
        </Link>
      </div>
    );
  }
  const initial = (data.user.name || data.user.email).trim().charAt(0).toUpperCase();
  return (
    <div className="account-menu">
      <Link href="/alerts">Alerts</Link>
      <Link href="/account" className="avatar" title={data.user.email} aria-label="Your account">
        {initial}
      </Link>
    </div>
  );
}
