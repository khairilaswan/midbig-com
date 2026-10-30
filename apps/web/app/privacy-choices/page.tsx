import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyChoices } from "@/components/privacy";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy choices: do not sell or share my personal information",
  alternates: { canonical: "/privacy-choices" },
};

export default function PrivacyChoicesPage() {
  return (
    <article className="legal narrow">
      <h1 className="page-title">Privacy choices</h1>
      <h2>Do not sell or share my personal information</h2>
      <p>
        midbig doesn&rsquo;t sell your personal information or share it for targeted advertising, so there is
        nothing to opt out of today. If that changes, the choice below and your browser&rsquo;s Global Privacy Control
        signal will both count as an opt-out. To opt out for your account rather than just this browser, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <h2>Cookies on this browser</h2>
      <PrivacyChoices />
      <p className="muted small">
        Download or delete your data from your <Link href="/account">account page</Link>. Details are in the{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </article>
  );
}
