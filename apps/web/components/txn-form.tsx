"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd, type AssetClass } from "@midbig/shared";
import { addTxn } from "@/app/actions";
import { CoinLogo } from "./market";
import { SearchBox, type SearchResult } from "./search-box";

export interface PickedCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  price: number | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A trade on today's date keeps the current time; past dates use midday UTC. */
function toTimestamp(date: string): number {
  if (date === today()) return Date.now();
  return Date.parse(`${date}T12:00:00Z`);
}

function num(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").replace(/[,\s$]/g, "");
  return s === "" ? NaN : Number(s);
}

/** Picks an asset from search (coins and stocks unless `classes` says otherwise), or shows the one chosen. */
export function CoinField({
  coin,
  onChange,
  classes = ["crypto", "stock"],
}: {
  coin: PickedCoin | null;
  onChange: (c: PickedCoin | null) => void;
  classes?: AssetClass[];
}) {
  if (!coin) {
    const placeholder = classes.includes("forex") ? "Search coins, stocks, forex" : "Search for a coin or stock";
    return <SearchBox placeholder={placeholder} classes={classes} onPick={(r: SearchResult) => onChange(r)} />;
  }
  return (
    <div className="picked">
      <CoinLogo src={coin.image} symbol={coin.symbol} size={22} />
      <strong>{coin.name}</strong> <span className="sym">{coin.symbol}</span>
      <button type="button" className="btn link small" onClick={() => onChange(null)}>
        Change
      </button>
    </div>
  );
}

export function TxnForm({ initialCoin, onDone }: { initialCoin: PickedCoin | null; onDone?: () => void }) {
  const router = useRouter();
  const [coin, setCoin] = useState<PickedCoin | null>(initialCoin);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(initialCoin?.price ? String(+initialCoin.price.toPrecision(6)) : "");
  const [fee, setFee] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = num(qty) * num(price) + (num(fee) || 0);

  return (
    <form
      className="form txn-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!coin) return setError("Pick a coin first.");
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        const res = await addTxn({
          assetId: coin.id,
          side,
          quantity: num(qty),
          price: num(price),
          fee: num(fee) || 0,
          executedAt: toTimestamp(String(f.get("date"))),
          note: String(f.get("note") ?? ""),
        });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        setQty("");
        setFee("");
        router.refresh();
        onDone?.();
      }}
    >
      <div className="seg" role="radiogroup" aria-label="Buy or sell">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            className={side === s ? `on ${s}` : ""}
            onClick={() => setSide(s)}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      <label>
        Coin or stock
        <CoinField
          coin={coin}
          onChange={(c) => {
            setCoin(c);
            if (c?.price) setPrice(String(+c.price.toPrecision(6)));
          }}
        />
      </label>
      <div className="form-row">
        <label>
          Quantity
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.5" required />
        </label>
        <label>
          Price per coin (USD)
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
      </div>
      <div className="form-row">
        <label>
          Date
          <input name="date" type="date" defaultValue={today()} max={today()} min="2009-01-03" required />
        </label>
        <label>
          Fee (USD) <span className="muted">(optional)</span>
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
        </label>
      </div>
      <label>
        Note <span className="muted">(optional)</span>
        <input name="note" maxLength={200} placeholder="e.g. Coinbase" />
      </label>
      <p className="muted small">
        {side === "buy" ? "Total cost" : "Total received"}:{" "}
        <strong>{Number.isFinite(total) ? formatUsd(side === "buy" ? total : total - 2 * (num(fee) || 0)) : "—"}</strong>
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>
        {busy ? "Saving…" : side === "buy" ? "Add buy" : "Add sell"}
      </button>
    </form>
  );
}
