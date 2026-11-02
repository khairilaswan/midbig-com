import Link from "next/link";
import { Avatar } from "./avatar";

/** The header's right side: log in, or the bell and the member's photo. */
export function AccountMenu({ me }: { me: { name: string; email: string; avatar: string | null; unread: number } | null }) {
  if (!me) {
    return (
      <div className="account-menu">
        <Link href="/login">Log in</Link>
        <Link href="/signup" className="btn small">
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="account-menu">
      <Link href="/alerts">Alerts</Link>
      <Link href="/notifications" className="bell" aria-label={me.unread ? `Notifications, ${me.unread} new` : "Notifications"}>
        🔔{me.unread > 0 && <span className="bell-count">{me.unread > 9 ? "9+" : me.unread}</span>}
      </Link>
      <Link href="/account" className="avatar-link" title={me.email} aria-label="Your account">
        <Avatar name={me.name} src={me.avatar} size={32} />
      </Link>
    </div>
  );
}
