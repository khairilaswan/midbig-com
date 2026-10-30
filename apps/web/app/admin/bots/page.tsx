import Link from "next/link";
import { BOT_KINDS, profilePath } from "@midbig/shared";
import { BotForm } from "@/components/admin";
import { botActivity } from "@/lib/admin";
import { aiEnabled, listBots } from "@/lib/bots";

export default async function AdminBots() {
  const [bots, activity] = await Promise.all([listBots(true), botActivity()]);
  return (
    <>
      <p className="small muted">
        Members call a bot by writing <code>@handle</code> in a post, comment or chat message, usually with a ticker like{" "}
        <code>$AAPL</code>. In a coin or stock community the bot uses that asset when no ticker is given. Every reply is
        labelled as a bot and &ldquo;not financial advice&rdquo;. Each member can ask bots 20 times an hour.
      </p>
      {!aiEnabled && (
        <p className="notice small">
          AI bots need <code>ANTHROPIC_API_KEY</code> in the <code>.env</code> file (an API key from console.anthropic.com).
          Without it they answer that they&rsquo;re switched off. Each AI reply costs money, so keep their daily limit low.
        </p>
      )}
      <ul className="admin-list">
        {bots.map((b) => (
          <li key={b.userId} className={b.enabled ? undefined : "suspended"}>
            <div>
              <Link href={profilePath(b.handle)}>
                <strong>@{b.handle}</strong>
              </Link>{" "}
              <span className="muted small">
                {BOT_KINDS[b.kind].name} · {activity[b.userId]?.day ?? 0} replies today, {activity[b.userId]?.week ?? 0} this
                week · limit {b.dailyCap}/day{!b.enabled && " · OFF"}
              </span>
            </div>
            <details>
              <summary className="small">Edit</summary>
              <BotForm bot={b} />
            </details>
          </li>
        ))}
      </ul>
      <section className="panel">
        <h2>New bot</h2>
        <BotForm />
      </section>
    </>
  );
}
