import type { Metadata } from "next";
import Link from "next/link";
import { saveMyHomeLayout } from "@/app/layout-actions";
import { LayoutEditor } from "@/components/home-layout-editor";
import { requireSession } from "@/lib/auth";
import { BLOCK_TEMPLATES, SCHEMAS, type BlockTemplate } from "@/lib/home-layout";
import { layoutEditing, memberHomeLayouts } from "@/lib/home-layout-store";
import { currentLook } from "@/lib/look";

export const metadata: Metadata = { title: "Customize your home page", robots: { index: false } };
export const dynamic = "force-dynamic";

/** A member arranges their own home page by drag and drop. */
export default async function Customize({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const session = await requireSession("/customize");
  const [editing, { look }, mine] = await Promise.all([layoutEditing(), currentLook(session.user.id), memberHomeLayouts(session.user.id)]);
  if (!editing.members) {
    return (
      <div className="narrow">
        <h1 className="page-title">Customize your home page</h1>
        <p className="notice">Arranging your own home page is switched off right now.</p>
      </div>
    );
  }
  const asked = (await searchParams).template;
  const initial = BLOCK_TEMPLATES.includes(asked as BlockTemplate) ? asked : look.template === "markets" ? "hub" : look.template;
  return (
    <div>
      <h1 className="page-title">Customize your home page</h1>
      <p className="small muted">
        Drag blocks onto the page, drag them to reorder or move them between columns, and click Edit to change one. Only
        you see your arrangement. Your home page uses the{" "}
        <strong>{look.template === "markets" ? "Markets (coin table)" : SCHEMAS[look.template].name}</strong> template; pick
        another in <Link href="/settings/appearance">Appearance</Link>.
      </p>
      <LayoutEditor
        pages={BLOCK_TEMPLATES.map((t) => ({
          key: t,
          schema: t,
          label: SCHEMAS[t].name,
          badge: t === look.template ? "yours" : mine.custom.includes(t) ? "arranged" : undefined,
          previewHref: `/?template=${t}`,
        }))}
        layouts={mine.layouts}
        initialKey={initial}
        save={saveMyHomeLayout}
        resetLabel="Use the site's layout"
      />
    </div>
  );
}
