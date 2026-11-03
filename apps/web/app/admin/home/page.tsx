import { adminSaveHomeLayout, adminSetDefaultTemplate } from "@/app/admin-actions";
import { LayoutSwitches } from "@/components/admin";
import { LayoutEditor } from "@/components/home-layout-editor";
import { BLOCK_TEMPLATES, SCHEMAS } from "@/lib/home-layout";
import { homeLayouts, layoutEditing } from "@/lib/home-layout-store";
import { siteLook } from "@/lib/look";

/** The blocks that make up each home template, the site default, and who else may arrange pages. */
export default async function AdminHome() {
  const [layouts, site, editing] = await Promise.all([homeLayouts(), siteLook(), layoutEditing()]);
  return (
    <>
      <section className="panel">
        <h2>Home page layout</h2>
        <p className="small muted">
          Drag blocks from the list on the left onto the page, drag them to reorder or move them between columns, and
          click Edit on a block to change its heading or size. Save shows it on the home page for everyone on that
          template who hasn&rsquo;t arranged their own. The Markets template is the coin table and has no blocks.
        </p>
        <LayoutEditor
          pages={BLOCK_TEMPLATES.map((t) => ({
            key: t,
            schema: t,
            label: SCHEMAS[t].name,
            badge: t === site.template ? "default" : undefined,
            previewHref: `/?template=${t}`,
          }))}
          layouts={layouts}
          initialKey={site.template}
          save={adminSaveHomeLayout}
          makeDefault={adminSetDefaultTemplate}
          defaultKey={site.template}
        />
      </section>
      <section className="panel">
        <h2>Who else can arrange pages</h2>
        <LayoutSwitches editing={editing} />
      </section>
    </>
  );
}
