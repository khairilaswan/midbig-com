import type { Metadata } from "next";
import Link from "next/link";
import { CHAT_LIMITS, COLLAPSE_SCORE, FORUM_LIMITS, REP_POINTS, TRUSTED_MIN_AGE_MS, TRUSTED_MIN_REP } from "@midbig/shared";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Community rules",
  description: "How midbig chat and the forum work: what's allowed, what gets held for a moderator, reputation, and how to report scams.",
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

      <h2>The forum</h2>
      <ul>
        <li>The same rules and the same scam filter apply to forum posts, titles and profile bios. Bios can&rsquo;t
          contain links or contact details.</li>
        <li>Share reasoning, not signals. &ldquo;I think X because Y&rdquo; is welcome; &ldquo;buy X now&rdquo;, paid
          groups and copy-trading offers are not.</li>
        <li>You can start a topic every {FORUM_LIMITS.topicGapMs / 60_000} minutes and reply every{" "}
          {FORUM_LIMITS.replyGapMs / 1000} seconds, and fix your posts during their first hour. A changed post goes
          through the filter again.</li>
        <li>Moderators can pin and lock topics. Banning someone pauses both chat and the forum and removes what they
          posted in the last day.</li>
      </ul>

      <h2 id="communities">Communities</h2>
      <ul>
        <li><strong>b/</strong> communities are midbig&rsquo;s own: the main coins, stocks and forex pairs (b/bitcoin,
          b/AAPL, b/eurusd) and topic hubs such as b/general.</li>
        <li><strong>m/</strong> communities are for smaller coins and are made by verified members. Smaller coins are
          riskier and easier to manipulate; check the contract address and do your own research.</li>
        <li>Each community has its own topics, chat, chart and info. Its moderators can remove posts and pin or lock
          topics there, and community rules add to these ones.</li>
        <li>Bots such as @pricebot, @riskbot and @pulsebot answer when you mention them. Their replies are automated,
          labelled &ldquo;Bot&rdquo;, and not financial advice.</li>
      </ul>

      <h2 id="reputation">Votes and reputation</h2>
      <ul>
        <li>Press <strong>▲</strong> on posts that add something and <strong>▼</strong> on ones that don&rsquo;t
          (shilling, spam, no reasoning). Each upvote from someone else earns the author {REP_POINTS.vote} point and
          each downvote costs one; each post a moderator removes costs {Math.abs(REP_POINTS.removed)}. Posts at{" "}
          {COLLAPSE_SCORE} or below are folded away. Accounts can upvote after their first day and downvote after three.</li>
        <li>Levels: Member from 10 points, Trusted from {TRUSTED_MIN_REP} (with an account at least{" "}
          {TRUSTED_MIN_AGE_MS / 86_400_000} days old), Veteran from 250.</li>
        <li>Trusted members can link to sites off our allow list without waiting for a moderator, and their reports
          count double.</li>
        <li>Reputation measures how useful others found someone&rsquo;s posts, not whether their trades make money. It
          is never a reason to follow anyone&rsquo;s calls.</li>
        <li>Trading votes, voting rings and extra accounts break these rules; moderators reset reputation built that
          way.</li>
      </ul>

      <h2>Appeals and takedowns</h2>
      <p>
        If you think a moderator got it wrong, or you want something you or someone else posted taken down (for
        example, it shares your personal details or infringes your copyright), email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with a link to the room or post, the time, and what&rsquo;s
        wrong. We aim to reply within 7 days. See the <Link href="/terms">Terms</Link> for more.
      </p>
    </article>
  );
}
