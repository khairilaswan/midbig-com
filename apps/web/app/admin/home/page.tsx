import { HomeLayoutEditor } from "@/components/home-layout-editor";
import { homeLayouts } from "@/lib/home-layout-store";
import { siteLook } from "@/lib/look";

/** The blocks that make up each community-first home page template. */
export default async function AdminHome() {
  const [layouts, site] = await Promise.all([homeLayouts(), siteLook()]);
  return (
    <section className="panel">
      <h2>Home page layout</h2>
      <p className="small muted">
        Each home template is made of blocks. Add, remove, reorder and edit them here. Changes show on the home page as
        soon as you save, for everyone on that template. The Markets template is the coin table and has no blocks.
      </p>
      <HomeLayoutEditor layouts={layouts} siteTemplate={site.template} />
    </section>
  );
}
