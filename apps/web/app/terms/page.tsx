import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using midbig.com, its market data, portfolio tools, chat and forum.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="legal narrow">
      <h1 className="page-title">Terms of service</h1>
      <p className="muted">Last updated {LEGAL_UPDATED}</p>

      <p>
        These terms cover your use of midbig.com and its app (&ldquo;midbig&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By using midbig you agree to them. If you don&rsquo;t agree, please don&rsquo;t use the
        site.
      </p>

      <h2>1. Information only, not advice</h2>
      <p>
        midbig shows market prices, charts, portfolio figures and what-if scenarios for information only. Nothing on
        midbig, including anything posted in chat or the forum, is financial, investment, tax or legal advice, or a recommendation
        to buy or sell anything. We are not a broker, exchange, or investment adviser, and we don&rsquo;t hold anyone&rsquo;s
        money or crypto. Crypto is volatile and you can lose everything you put in. Make your own decisions, and talk
        to a licensed professional if you need advice.
      </p>

      <h2>2. Data can be late or wrong</h2>
      <p>
        Prices come from exchanges and data providers and can be delayed, incomplete or wrong. We mark a price
        &ldquo;Delayed&rdquo; when no exchange has confirmed it in the last 60 seconds, but we can&rsquo;t promise any
        figure is accurate or current. Simulator results are estimates based on simple models and past prices; they
        don&rsquo;t predict what will happen. Price alerts can arrive late or not at all. Don&rsquo;t rely on midbig
        for trading decisions.
      </p>

      <h2>3. Your account</h2>
      <ul>
        <li>You must be 18 or older to create an account.</li>
        <li>Keep your login safe. Turn on two-factor login in your account settings. You&rsquo;re responsible for what
          happens under your account.</li>
        <li>One person per account, and no accounts made by bots or scripts.</li>
        <li>You can delete your account at any time from your <Link href="/account">account page</Link>.</li>
      </ul>

      <h2>4. What you post</h2>
      <p>
        You own what you post in chat and the forum. By posting, you give us a worldwide, non-exclusive, royalty-free licence to
        store, display and share it on midbig so the service works. You promise you have the right to post it and
        that it follows the <Link href="/rules">Community rules</Link>.
      </p>
      <p>
        We don&rsquo;t check every message before it appears, and we aren&rsquo;t responsible for what members post.
        We can hold, remove or refuse any message, and pause, ban or close any account that breaks these terms or the
        rules, with or without notice.
      </p>

      <h2>5. Reports and takedown requests</h2>
      <p>
        Report a message with the <strong>⋯</strong> button next to it. To ask us to take something down, including
        for copyright or privacy reasons, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with: where it
        is (the room and time, or a link), why it should come down, your contact details, and, for copyright, what work
        you own and a statement that you believe in good faith the use isn&rsquo;t authorised. We review every notice
        and aim to reply within 7 days. If we remove your content and you think it was a mistake, reply to our message
        or email us to appeal.
      </p>

      <h2>6. Things you must not do</h2>
      <ul>
        <li>Scam, phish, impersonate others, or try to get people&rsquo;s keys, passwords or money.</li>
        <li>Promote pump-and-dumps or otherwise try to manipulate a market.</li>
        <li>Copy or scrape midbig&rsquo;s data in bulk, or resell it.</li>
        <li>Break, overload or probe the site&rsquo;s security, or get around rate limits and bans.</li>
        <li>Use midbig for anything illegal where you or we are.</li>
      </ul>

      <h2>7. Other sites</h2>
      <p>
        midbig links to exchanges, news and other sites, and later may show ads or affiliate links (always labelled).
        We don&rsquo;t control those sites and aren&rsquo;t responsible for them.
      </p>

      <h2>8. No warranty, limited liability</h2>
      <p>
        midbig is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind. To the
        fullest extent the law allows, we aren&rsquo;t liable for any loss arising from your use of midbig, including
        trading losses, lost profits or lost data, and our total liability to you is limited to USD 100. Some places
        don&rsquo;t allow these limits, so they may not all apply to you.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may change these terms. If a change matters, we&rsquo;ll say so on the site before it takes effect. Using
        midbig after that means you accept the new terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. How we handle personal data is in the{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </article>
  );
}
