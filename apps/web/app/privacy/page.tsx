import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What midbig collects, why, who it's shared with, and your rights under US state laws, GDPR and PDPA.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="legal narrow">
      <h1 className="page-title">Privacy policy</h1>
      <p className="muted">Last updated {LEGAL_UPDATED}</p>

      <p>
        This explains what personal information midbig.com collects, why, and what you can do about it. midbig is run
        from Malaysia and hosted in the United States. Contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p className="notice">
        <strong>The short version:</strong> we collect what&rsquo;s needed to run your account, portfolio, chat and forum. We
        don&rsquo;t sell your personal information or share it for targeted advertising. You can download or delete
        your data at any time from your <Link href="/account">account page</Link>.
      </p>

      <h2>What we collect</h2>
      <table className="legal-table">
        <thead>
          <tr>
            <th>What</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Email, name, password (stored only as a secure hash), Google account id if you sign in with Google</td>
            <td>To create your account and log you in</td>
          </tr>
          <tr>
            <td>Two-factor login secret and backup codes (encrypted)</td>
            <td>To check your login codes</td>
          </tr>
          <tr>
            <td>Watchlist, portfolio transactions, price alerts</td>
            <td>To show and value your portfolio and send your alerts</td>
          </tr>
          <tr>
            <td>Public name, bio, chat messages, forum posts, helpful votes, reputation, reports you make, people you mute</td>
            <td>To run chat and the forum, show public profiles, keep them free of scams, and handle reports</td>
          </tr>
          <tr>
            <td>Notification address for each device you turn alerts on for</td>
            <td>To deliver price alerts</td>
          </tr>
          <tr>
            <td>IP address, browser type, and pages requested, in short-lived server logs</td>
            <td>Security, rate limits, bot checks and fixing problems</td>
          </tr>
          <tr>
            <td>Cookies that keep you logged in and remember your privacy choice</td>
            <td>Needed for the site to work</td>
          </tr>
        </tbody>
      </table>
      <p>
        If you use the what-if simulator without an account, your holdings stay in your browser and never reach us.
        We don&rsquo;t use advertising or analytics cookies today. If we add them, they&rsquo;ll stay off unless you
        allow them in <Link href="/privacy-choices">Privacy choices</Link>.
      </p>

      <h2>Legal bases (EU, UK)</h2>
      <p>
        We use your data to provide the service you signed up for (contract), to keep midbig secure and free of abuse
        (legitimate interests), to meet legal duties, and, for any optional cookies, with your consent, which you can
        withdraw at any time.
      </p>

      <h2>Who we share it with</h2>
      <p>Only the service providers that run midbig for us, under contracts that limit what they can do with it:</p>
      <ul>
        <li>Our hosting provider (servers in the United States)</li>
        <li>Cloudflare, for security, speeding up the site and bot checks</li>
        <li>Resend, to send emails such as password resets and alerts</li>
        <li>Google, Apple or Mozilla, which deliver browser notifications</li>
        <li>Google, if you choose to sign in with Google</li>
      </ul>
      <p>
        Chat messages and your chat name are public to everyone who opens that room. Forum posts, your bio, reputation and profile page are public to everyone, and search engines may index forum topics and established members&rsquo; profiles. We may also disclose information
        if the law requires it, or to protect people from fraud or harm.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account data until you delete your account. Deleting it erases your account, watchlist,
        portfolio, alerts, chat messages and forum posts straight away; any copies in backups expire within 30 days. Server logs
        are overwritten as they fill up, usually within a few weeks.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li><strong>See and download your data:</strong> <Link href="/account">Account</Link> &gt; Download my data.</li>
        <li><strong>Delete your account and data:</strong> <Link href="/account">Account</Link> &gt; Delete account.</li>
        <li><strong>Correct it:</strong> change your public name, bio and password in your account, edit a forum post in its first hour, or email us.</li>
        <li><strong>Object or restrict</strong> how we use it, or <strong>withdraw consent</strong> to optional cookies, in{" "}
          <Link href="/privacy-choices">Privacy choices</Link> or by email.</li>
      </ul>

      <h3>US state privacy rights (including California)</h3>
      <p>
        Residents of California and other US states with privacy laws can ask to know, access, correct and delete their
        personal information, and to opt out of its &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; for targeted
        advertising. <strong>We don&rsquo;t sell or share personal information</strong> in that sense, and we honour
        the Global Privacy Control signal as an opt-out if that ever changes. The categories we collect are identifiers
        (email, IP address), account and financial interest information you enter (portfolio), internet activity (logs),
        and the content of your messages, all for the purposes above. We won&rsquo;t treat you differently for using
        your rights. You can use an authorised agent; we&rsquo;ll check the request with you.
      </p>

      <h3>Malaysia (PDPA)</h3>
      <p>
        Under Malaysia&rsquo;s Personal Data Protection Act you can ask to access and correct your personal data, and
        limit how it&rsquo;s processed. Giving us your email is needed to create an account; everything else is
        optional.
      </p>

      <p>
        To use any right, use the account tools above or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
        from the email on your account. We reply within 30 days. You can also complain to your local data protection
        authority.
      </p>

      <h2>International transfers</h2>
      <p>
        Your data is stored in the United States and may be accessed from Malaysia. Where the law requires it, we use
        safeguards such as standard contractual clauses for these transfers.
      </p>

      <h2>Security</h2>
      <p>
        Connections are encrypted, passwords are hashed, and two-factor login is available to everyone and required
        for moderators. No system is perfectly secure; if a breach affects you, we&rsquo;ll tell you as the law
        requires.
      </p>

      <h2>Children</h2>
      <p>
        midbig is for adults. We don&rsquo;t knowingly collect data from anyone under 18; if you think a child has
        signed up, email us and we&rsquo;ll delete the account.
      </p>

      <h2>Changes</h2>
      <p>We&rsquo;ll post any changes here and update the date at the top. Big changes will be announced on the site.</p>
    </article>
  );
}
