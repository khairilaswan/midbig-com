"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { computeHoldings, formatPct, formatUsd, pctChange, valueHoldings } from "@midbig/shared";
import { deleteTxn } from "@/app/actions";
import type { AssetRow } from "@/lib/types";
import type { TxnRow } from "@/lib/user-data";
import { useLivePrices } from "./live";
import { Change, CoinLogo, displayPrice } from "./market";
import { TxnForm, type PickedCoin } from "./txn-form";

function Money({ value, signed = false }: { value: number | null; signed?: boolean }) {
  if (value == null) return <span className="muted">—</span>;
  const cls = signed ? (value >= 0 ? "chg up" : "chg down") : "";
  const text = signed ? (value >= 0 ? "+" : "−") + formatUsd(Math.abs(value)) : formatUsd(value);
  return <span className={cls}>{text}</span>;
}

function qtyText(q: number): string {
  return q.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function PortfolioView({
  txns,
  assets,
  addCoin,
}: {
  txns: TxnRow[];
  assets: AssetRow[];
  addCoin: PickedCoin | null;
}) {
  const router = useRouter();
  const live = useLivePrices(assets);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const holdings = useMemo(() => computeHoldings(txns), [txns]);
  const { rows, totals } = valueHoldings(holdings, (id) => {
    const a = byId.get(id);
    return a ? displayPrice(a, live.get(id) ?? null) : null;
  });
  const open = rows.filter((r) => r.quantity > 0);
  // 24h change of the whole portfolio, from each coin's price 24h ago.
  let then = 0;
  let now = 0;
  for (const r of open) {
    const a = byId.get(r.assetId);
    if (!a?.ref24h || r.value == null) continue;
    then += r.quantity * a.ref24h;
    now += r.value;
  }
  const change24h = then > 0 ? pctChange(now, then) : null;

  const [showForm, setShowForm] = useState(txns.length === 0 || addCoin != null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  return (
    <>
      <div className="summary">
        <div className="card">
          <span className="muted">Value now</span>
          <strong className="big">{formatUsd(totals.value)}</strong>
          <span>
            <Change value={change24h} /> <span className="muted">24h</span>
          </span>
        </div>
        <div className="card">
          <span className="muted">Profit / loss on what you hold</span>
          <strong className="big">
            <Money value={open.length ? totals.unrealized : null} signed />
          </strong>
          <span className="muted">{totals.unrealizedPct != null ? formatPct(totals.unrealizedPct) : ""} vs. {formatUsd(totals.costBasis)} paid</span>
        </div>
        <div className="card">
          <span className="muted">Profit / loss from sales</span>
          <strong className="big">
            <Money value={totals.realized} signed />
          </strong>
          <span className="muted">after fees</span>
        </div>
      </div>
      {totals.unpriced > 0 && (
        <p className="muted small">{totals.unpriced} coin(s) have no price right now and are left out of the totals.</p>
      )}

      <div className="page-head">
        <h2>Holdings</h2>
        <p className="row-gap">
          {open.length > 0 && (
            <Link href="/what-if" className="btn secondary small">
              What if…? Simulate this portfolio
            </Link>
          )}
          <button type="button" className="btn small" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Close" : "+ Add transaction"}
          </button>
        </p>
      </div>

      {showForm && (
        <section className="panel">
          <h3>Add a buy or sell</h3>
          <TxnForm initialCoin={addCoin} onDone={() => setShowForm(false)} />
        </section>
      )}

      {open.length === 0 ? (
        <p className="empty">No holdings yet. Add your first buy to see its value and profit update live.</p>
      ) : (
        <div className="table-wrap">
          <table className="market holdings">
            <thead>
              <tr>
                <th>Coin</th>
                <th className="num">Price</th>
                <th className="num hide-sm">24h</th>
                <th className="num">Holdings</th>
                <th className="num hide-sm">Avg. cost</th>
                <th className="num">Profit / loss</th>
                <th className="num hide-md">Share</th>
              </tr>
            </thead>
            <tbody>
              {open.map((r) => {
                const a = byId.get(r.assetId);
                return (
                  <tr key={r.assetId}>
                    <td className="coin">
                      <Link href={`/coins/${r.assetId}`}>
                        <CoinLogo src={a?.image ?? null} symbol={a?.symbol ?? "?"} />
                        <span className="name">{a?.name ?? r.assetId}</span>
                        <span className="sym">{a?.symbol}</span>
                      </Link>
                    </td>
                    <td className="num">{formatUsd(r.price)}</td>
                    <td className="num hide-sm">
                      <Change value={pctChange(r.price, a?.ref24h)} />
                    </td>
                    <td className="num">
                      <div>{formatUsd(r.value)}</div>
                      <div className="muted small">
                        {qtyText(r.quantity)} {a?.symbol}
                      </div>
                    </td>
                    <td className="num hide-sm">{formatUsd(r.avgCost)}</td>
                    <td className="num">
                      <div>
                        <Money value={r.unrealized} signed />
                      </div>
                      <div className="small">
                        <Change value={r.unrealizedPct} />
                      </div>
                    </td>
                    <td className="num hide-md">{r.weight != null ? `${(r.weight * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {txns.length > 0 && (
        <>
          <h2>Transactions</h2>
          {error && <p className="form-error">{error}</p>}
          <div className="table-wrap">
            <table className="market txns">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Coin</th>
                  <th className="num">Quantity</th>
                  <th className="num hide-sm">Price</th>
                  <th className="num">Total</th>
                  <th>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const a = byId.get(t.assetId);
                  const total = t.quantity * t.price + (t.side === "buy" ? t.fee : -t.fee);
                  return (
                    <tr key={t.id}>
                      <td className="muted">
                        {new Date(t.executedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                      </td>
                      <td>
                        <span className={`side ${t.side}`}>{t.side === "buy" ? "Buy" : "Sell"}</span> {a?.symbol ?? t.assetId}
                        {t.note && <span className="muted small"> · {t.note}</span>}
                      </td>
                      <td className="num">{qtyText(t.quantity)}</td>
                      <td className="num hide-sm">{formatUsd(t.price)}</td>
                      <td className="num">{formatUsd(total)}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn link small"
                          disabled={pending}
                          aria-label="Remove this transaction"
                          onClick={() =>
                            start(async () => {
                              const res = await deleteTxn(t.id);
                              setError(res.ok ? "" : res.error);
                              if (res.ok) router.refresh();
                            })
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
