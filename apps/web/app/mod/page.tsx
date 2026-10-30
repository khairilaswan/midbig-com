import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { canModerate, getViewer, listBans, listStaff, moderationQueue, moderationStats } from "@/lib/chat";
import { BanList, ForumQueue, ModQueue, StaffList } from "@/components/mod-tools";
import { forumQueue } from "@/lib/forum";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ModPage() {
  const session = await requireSession("/mod");
  const viewer = await getViewer(session.user.id);
  if (!viewer?.isStaff) notFound();

  if (!canModerate(viewer)) {
    return (
      <div className="narrow">
        <h1 className="page-title">Moderation</h1>
        <p className="notice">
          Moderator tools need two-factor login. Turn it on in <Link href="/account#two-factor">your account</Link>,
          then come back.
        </p>
      </div>
    );
  }

  const [queue, forum, stats, bans, staff] = await Promise.all([
    moderationQueue(),
    forumQueue(),
    moderationStats(),
    listBans(),
    viewer.role === "admin" ? listStaff() : Promise.resolve(null),
  ]);
  const total = stats.caughtByFilter + stats.reportedFirst;

  return (
    <div className="mod">
      <h1 className="page-title">Moderation</h1>
      <p className="lede">
        {total === 0
          ? "Last 7 days: no messages removed yet."
          : `Last 7 days: the filter caught ${stats.caughtByFilter} of the ${total} messages moderators removed (${Math.round(
              (stats.caughtByFilter / total) * 100,
            )}%); ${stats.reportedFirst} needed a report first.`}
      </p>
      <ModQueue items={queue} />
      <ForumQueue items={forum} />
      <BanList bans={bans} />
      {staff && <StaffList staff={staff} />}
    </div>
  );
}
