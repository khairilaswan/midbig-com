import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { requireSession } from "@/lib/auth";
import { getViewer } from "@/lib/chat";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const TABS = [
  ["/admin", "Overview"],
  ["/admin/communities", "Communities"],
  ["/admin/users", "Members"],
  ["/admin/bots", "Bots"],
  ["/mod", "Reports and moderation"],
  ["/admin/log", "Log"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/admin");
  const viewer = await getViewer(session.user.id);
  if (viewer?.role !== "admin") notFound();
  if (!isAdmin(viewer)) {
    return (
      <div className="narrow">
        <h1 className="page-title">Admin</h1>
        <p className="notice">
          The admin portal needs two-factor login. Turn it on in <Link href="/account#two-factor">your account</Link>,
          then come back.
        </p>
      </div>
    );
  }
  return (
    <div className="admin">
      <h1 className="page-title">Admin</h1>
      <nav className="tabs" aria-label="Admin">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
