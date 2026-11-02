import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ago } from "@/components/forum-list";
import { requireSession } from "@/lib/auth";
import { listNotifications, markAllRead, type NotificationItem } from "@/lib/social";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

function what(n: NotificationItem): React.ReactNode {
  const who = <strong>{n.actor?.name ?? "Someone"}</strong>;
  if (n.kind === "reply") return <>{who} replied to you</>;
  if (n.kind === "mention") return <>{who} mentioned you</>;
  if (n.kind === "follow") return <>{who} started following you</>;
  return <>Your post passed {n.n?.toLocaleString("en-US")} upvotes 🎉</>;
}

/** Replies, mentions, new followers and vote milestones. Opening the page marks them read. */
export default async function NotificationsPage() {
  const { user } = await requireSession("/notifications");
  const items = await listNotifications(user.id);
  if (items.some((n) => !n.read)) await markAllRead(user.id);

  return (
    <div className="narrow">
      <h1 className="page-title">Notifications</h1>
      {items.length === 0 ? (
        <p className="muted">
          Nothing yet. When someone replies to you, mentions your @name or follows you, it shows up here.{" "}
          <Link href="/forum">Go to the communities</Link>
        </p>
      ) : (
        <ol className="notif-list">
          {items.map((n) => (
            <li key={n.id} className={n.read ? undefined : "unread"}>
              <Link href={n.href}>
                {n.actor ? <Avatar name={n.actor.name} src={n.actor.avatar} size={36} /> : <span className="notif-icon" aria-hidden>🏆</span>}
                <span className="notif-text">
                  <span>{what(n)}</span>
                  {n.about && <span className="muted small notif-about">{n.about}</span>}
                </span>
                <span className="muted small">{ago(n.at)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">Read notifications older than 90 days are cleared.</p>
    </div>
  );
}
