import type { Metadata } from "next";
import Link from "next/link";
import { CHAT_LIMITS } from "@midbig/shared";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Community rules",
  description: "How midbig chat works: what's allowed, what gets held for a moderator, and how to report scams.",
  alternates: { canonical: "/rules" },
};

export default function RulesPage() {
  return (
    <article className="legal narrow">
      <h1 className="page-title">Community rules</h1>
      <p className="muted">Last updated {LEGAL_UPDATED}</p>

      <p className="notice">
        <strong>midbig staff will never message you privately, ask for your password, seed phrase or private key, or
        ask you to send crypto.</strong> Anyone who does is a scammer. Report them.
      </p>

      <h2>Be decent</h2>
      <ul>
        <li>Disagree with ideas, not people. No harassment, hate, threats or slurs.</li>
        <li>Don&rsquo;t share anyone&rsquo;s personal information, including your own phone number or address.</li>
        <li>Keep it legal, and keep it about markets. No adult content.</li>
      </ul>

      <h2>No scams or manipulation</h2>
      <ul>
        <li>No wallet addresses, &ldquo;DM me&rdquo;, or invites to Telegram, WhatsApp, Discord or other groups.</li>
        <li>No giveaways, airdrop claims, &ldquo;guaranteed returns&rdquo;, &ldquo;account managers&rdquo; or fund
          recovery offers.</li>
        <li>No pump-and-dump calls, coordinated buying, or paid promotion. If you hold a coin you talk up, say so.</li>
        <li>Don&rsquo;t pretend to be staff, a company or another person.</li>
        <li>No spam: repeated messages, all caps, walls of emojis, or unrelated links.</li>
      </ul>

      <h2>Nothing here is financial advice</h2>
      <p>
        Chat is people sharing opinions. Nobody here knows your situation, and anyone can be wrong or have a reason to
        talk a coin up. Do your own research before you trade, and never invest more than you can afford to lose.
      </p>

      <h2>How chat protects you</h2>
      <ul>
        <li>New accounts read for {CHAT_LIMITS.readOnlyMs / 60_000} minutes before they can post, and can&rsquo;t post
          links for their first {CHAT_LIMITS.noLinksMs / 3600_000} hours.</li>
        <li>Everyone can post one message every {CHAT_LIMITS.minGapMs / 1000} seconds.</li>
        <li>A filter holds messages that look like scams (wallet addresses, group invites, &ldquo;DM me&rdquo;,
          promised returns, lookalike links) until a moderator checks them. Only the author sees a held message.</li>
        <li>Press <strong>⋯</strong> on any message to report it or mute the person. When{" "}
          {CHAT_LIMITS.reportsToHide} people report a message, it&rsquo;s hidden until a moderator looks.</li>
        <li>Moderators remove messages that break these rules and can pause or ban accounts from chat.</li>
      </ul>

      <h2>Appeals and takedowns</h2>
      <p>
        If you think a moderator got it wrong, or you want something you or someone else posted taken down (for
        example, it shares your personal details or infringes your copyright), email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with a link to the room, the time, and what&rsquo;s
        wrong. We aim to reply within 7 days. See the <Link href="/terms">Terms</Link> for more.
      </p>
    </article>
  );
}
