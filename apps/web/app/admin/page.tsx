import Link from "next/link";
import { CategoryToggles } from "@/components/admin";
import { overview } from "@/lib/admin";
import { categories } from "@/lib/settings";

export default async function AdminHome() {
  const [o, on] = await Promise.all([overview(), categories()]);
  return (
    <>
      <section className="panel">
        <h2>Categories</h2>
        <p className="small muted">
          Switching a category off hides its price pages, lists, search results, communities and their topics at once.
          Prices keep updating and nothing is deleted, so switching it back on restores everything.
        </p>
        <CategoryToggles on={on} />
      </section>

      <section>
        <h2>Today</h2>
        <dl className="stats">
          <div>
            <dt>Members</dt>
            <dd>
              {o.members.toLocaleString("en-US")} <span className="muted small">+{o.newMembers7d} this week</span>
            </dd>
          </div>
          <div>
            <dt>Verified</dt>
            <dd>{o.verified}</dd>
          </div>
          <div>
            <dt>Communities</dt>
            <dd>
              {o.communities.b} b/ · {o.communities.m} m/
              {o.communities.suspended > 0 && <span className="muted small"> · {o.communities.suspended} suspended</span>}
            </dd>
          </div>
          <div>
            <dt>Topics · comments (24h)</dt>
            <dd>
              {o.topics24h} · {o.comments24h}
            </dd>
          </div>
          <div>
            <dt>Chat messages (24h)</dt>
            <dd>{o.chat24h}</dd>
          </div>
          <div>
            <dt>Bot replies (24h)</dt>
            <dd>{o.botReplies24h}</dd>
          </div>
          <div>
            <dt>Waiting for a moderator</dt>
            <dd>
              <Link href="/mod">
                {o.queue.chat} chat · {o.queue.forum} forum
              </Link>
            </dd>
          </div>
          <div>
            <dt>Topics this week by category</dt>
            <dd className="small">
              Crypto {o.byClass.crypto} · Stocks {o.byClass.stock} · Forex {o.byClass.forex} · General {o.byClass.general}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
