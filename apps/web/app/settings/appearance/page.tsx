import type { Metadata } from "next";
import Link from "next/link";
import { LookPicker } from "@/components/look-picker";
import { saveLook } from "@/app/look-actions";
import { getSession } from "@/lib/auth";
import { currentLook } from "@/lib/look";

export const metadata: Metadata = { title: "Appearance", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const session = await getSession();
  const { look, site, own } = await currentLook(session?.user.id ?? null);

  return (
    <div className="appearance">
      <h1 className="page-title">Appearance</h1>
      {site.memberChoice ? (
        <>
          <p className="lede">
            Pick a theme style, its main color and a home page template. You see each change at once; it&rsquo;s kept
            when you save.{" "}
            {session ? "Your pick follows your account to other devices." : (
              <>
                It&rsquo;s kept in this browser. <Link href="/signup">Sign up</Link> to keep it on every device.
              </>
            )}
          </p>
          <LookPicker
            current={look}
            siteDefault={site}
            save={saveLook}
            reset={own ? saveLook.bind(null, null) : undefined}
          />
        </>
      ) : (
        <p className="lede">The site uses one look for everyone right now.</p>
      )}
    </div>
  );
}
