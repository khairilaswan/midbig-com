"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatUsd, type AlertDirection } from "@midbig/shared";
import { createAlert, deleteAlert } from "@/app/actions";
import type { AssetRow } from "@/lib/types";
import type { AlertRow } from "@/lib/user-data";
import { useLivePrices } from "./live";
import { displayPrice } from "./market";
import { CoinField, type PickedCoin } from "./txn-form";

function when(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function AlertForm({ initialCoin, emailEnabled }: { initialCoin: PickedCoin | null; emailEnabled: boolean }) {
  const router = useRouter();
  const [coin, setCoin] = useState<PickedCoin | null>(initialCoin);
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<AlertDirection | null>(null);
  const [email, setEmail] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = Number(target.replace(/[,\s$]/g, ""));
  // Until people choose, guess the direction from where the target is.
  const dir: AlertDirection = direction ?? (coin?.price != null && t > 0 && t < coin.price ? "below" : "above");

  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!coin) return setError("Pick a coin first.");
        setBusy(true);
        setError("");
        const res = await createAlert({ assetId: coin.id, direction: dir, target: t, notifyEmail: email });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setTarget("");
        setDirection(null);
        router.refresh();
      }}
    >
      <label>
        Coin
        <CoinField coin={coin} onChange={setCoin} />
      </label>
      {coin?.price != null && <p className="muted small">Now {formatUsd(coin.price)}</p>}
      <div className="form-row">
        <label>
          Tell me when the price goes
          <select value={dir} onChange={(e) => setDirection(e.target.value as AlertDirection)}>
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
        </label>
        <label>
          Target price (USD)
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required />
        </label>
      </div>
      {emailEnabled && (
        <label className="check">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Also email me
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>
        Create alert
      </button>
    </form>
  );
}

export function AlertList({ alerts, assets }: { alerts: AlertRow[]; assets: AssetRow[] }) {
  const router = useRouter();
  const live = useLivePrices(assets);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const [pending, start] = useTransition();
  if (alerts.length === 0) return <p className="empty">No alerts yet.</p>;
  return (
    <ul className="alert-list">
      {alerts.map((a) => {
        const asset = byId.get(a.assetId);
        const price = asset ? displayPrice(asset, live.get(a.assetId) ?? null) : null;
        return (
          <li key={a.id} className={a.triggeredAt ? "done" : ""}>
            <div>
              <Link href={`/coins/${a.assetId}`}>
                <strong>{asset?.symbol ?? a.assetId}</strong>
              </Link>{" "}
              {a.direction} <strong>{formatUsd(a.target)}</strong>
              {a.notifyEmail && <span className="muted small"> · email</span>}
            </div>
            <div className="muted small">
              {a.triggeredAt
                ? `Hit ${formatUsd(a.triggeredPrice)} on ${when(a.triggeredAt)}`
                : `Waiting · now ${formatUsd(price)}`}
            </div>
            <button
              type="button"
              className="btn link small"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deleteAlert(a.id);
                  router.refresh();
                })
              }
            >
              {a.triggeredAt ? "Clear" : "Delete"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
