import type { Metadata } from "next";
import Link from "next/link";
import { AlertForm, AlertList } from "@/components/alerts-view";
import { PushToggle } from "@/components/push-toggle";
import { emailEnabled, getSession } from "@/lib/auth";
import { getAlerts, getAssetRows, vapidKeys } from "@/lib/user-data";

export const metadata: Metadata = {
  title: "Crypto price alerts",
  description: "Get a notification on your phone or computer when a coin goes above or below your price. Free.",
};
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ coin?: string }> };

export default async function AlertsPage({ searchParams }: Props) {
  const { coin } = await searchParams;
  const session = await getSession();
  if (!session) {
    const next = coin ? `/alerts?coin=${encodeURIComponent(coin)}` : "/alerts";
    return (
      <div className="narrow">
        <h1 className="page-title">Price alerts</h1>
        <p className="lede">
          Get a notification on your phone or computer the moment a coin goes above or below your price.
        </p>
        <p className="row-gap">
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn">
            Create a free account
          </Link>
          <Link href={`/login?next=${encodeURIComponent(next)}`}>or log in</Link>
        </p>
      </div>
    );
  }
  const alerts = await getAlerts(session.user.id);
  const [assets, keys] = await Promise.all([
    getAssetRows([...new Set([...alerts.map((a) => a.assetId), ...(coin ? [coin] : [])])]),
    vapidKeys().catch(() => null),
  ]);
  const pick = coin ? assets.find((a) => a.id === coin) : undefined;
  const initialCoin = pick
    ? { id: pick.id, symbol: pick.symbol, name: pick.name, image: pick.image, price: pick.live?.p ?? pick.refPrice }
    : null;

  return (
    <div className="narrow">
      <h1 className="page-title">Price alerts</h1>
      <section className="panel">
        <h2>Notifications on this device</h2>
        <PushToggle publicKey={keys?.publicKey ?? null} />
      </section>
      <section className="panel">
        <h2>New alert</h2>
        <AlertForm initialCoin={initialCoin} emailEnabled={emailEnabled} />
      </section>
      <section>
        <h2>Your alerts</h2>
        <AlertList alerts={alerts} assets={assets} />
        <p className="muted small">
          Each alert fires once, within a few seconds of the price crossing your target, then moves to the bottom of the
          list.
        </p>
      </section>
    </div>
  );
}
