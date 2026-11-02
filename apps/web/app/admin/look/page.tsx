import { LookPicker } from "@/components/look-picker";
import { SiteLookForm } from "@/components/admin";
import { siteLook } from "@/lib/look";

/** The site's default look, and whether members may pick their own. */
export default async function AdminLook() {
  const site = await siteLook();
  return (
    <section className="panel">
      <h2>Site look</h2>
      <p className="small muted">
        Everyone who hasn&rsquo;t picked their own look sees this one, including search engines. The preview below
        changes only your screen until you save. If you picked your own look in Appearance, you keep seeing yours.
      </p>
      <SiteLookForm look={site} />
    </section>
  );
}
