"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  betaTo,
  BTC_ID,
  dailyReturns,
  formatPct,
  formatUsd,
  historicalRisk,
  looksStable,
  presetScenarios,
  runScenario,
  type Scenario,
  type Shock,
  type SimPosition,
} from "@midbig/shared";
import type { AssetRow } from "@/lib/types";
import type { RiskHistory } from "@/lib/user-data";
import { useLivePrices } from "./live";
import { CoinLogo, displayPrice } from "./market";
import { SearchBox } from "./search-box";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  /** Price when the coin was added, used until a live price arrives. */
  price: number | null;
}

interface Position {
  assetId: string;
  quantity: number;
}

interface Controls {
  btc: { kind: "price" | "pct"; value: number } | null;
  /** % move for every coin without its own (stablecoins excluded). */
  all: number | null;
  follow: boolean;
  /** Per-coin % moves typed into the table. */
  overrides: Record<string, number>;
}

const STORAGE_KEY = "midbig:what-if";
const EXAMPLE: Position[] = [
  { assetId: "bitcoin", quantity: 0.5 },
  { assetId: "ethereum", quantity: 4 },
  { assetId: "solana", quantity: 25 },
];
/** Beta uses the last 90 days, so it reflects how coins move together now. */
const BETA_DAYS = 90;

function controlsFrom(s: Scenario): Controls {
  const btc = s.shocks.find((x) => x.assetId === BTC_ID);
  const all = s.shocks.find((x) => x.assetId === "*");
  return {
    btc: btc ? { kind: btc.kind, value: btc.value } : null,
    all: all ? all.value : null,
    follow: s.followBtc,
    overrides: {},
  };
}

function parse(v: string): number | null {
  const s = v.replace(/[,\s$%]/g, "");
  if (s === "" || s === "-" || s === "+") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function useRisk(ids: string[]): RiskHistory | null {
  const key = [...new Set([...ids, BTC_ID])].sort().join(",");
  const [data, setData] = useState<{ key: string; h: RiskHistory } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/risk?ids=${encodeURIComponent(key)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((h: RiskHistory | null) => h && setData({ key, h }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [key]);
  return data?.key === key ? data.h : null;
}

export function Simulator({
  initial,
  coins: initialCoins,
  fromPortfolio,
}: {
  initial: Position[];
  /** Info for the coins in `initial`, Bitcoin and the example coins. */
  coins: AssetRow[];
  fromPortfolio: boolean;
}) {
  const [positions, setPositions] = useState<Position[]>(initial);
  const [extra, setExtra] = useState<Coin[]>([]);
  const [loaded, setLoaded] = useState(fromPortfolio);

  // Without an account, remember the holdings on this device.
  useEffect(() => {
    if (fromPortfolio) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
        positions: Position[];
        coins: Coin[];
      } | null;
      if (saved?.positions?.length) {
        setPositions(saved.positions.filter((p) => p.quantity > 0));
        setExtra(saved.coins ?? []);
      }
    } catch {
      // storage blocked or corrupt: start empty
    }
    setLoaded(true);
  }, [fromPortfolio]);

  const rows = useMemo(() => {
    const m = new Map<string, AssetRow | Coin>();
    for (const c of extra) m.set(c.id, c);
    for (const r of initialCoins) m.set(r.id, r);
    return m;
  }, [initialCoins, extra]);

  useEffect(() => {
    if (fromPortfolio || !loaded) return;
    try {
      const used = extra.filter((c) => positions.some((p) => p.assetId === c.id));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ positions, coins: used }));
    } catch {
      // ignore
    }
  }, [positions, extra, fromPortfolio, loaded]);

  const liveInput = useMemo(
    () => [...rows.values()].map((r) => ({ id: r.id, live: "live" in r ? r.live : null })),
    [rows],
  );
  const live = useLivePrices(liveInput);
  const priceOf = (id: string): number | null => {
    const r = rows.get(id);
    if (!r) return null;
    return "refPrice" in r ? displayPrice(r, live.get(id) ?? null) : (live.get(id)?.p ?? r.price);
  };

  const btcPrice = priceOf(BTC_ID);
  // Presets are built from the price on first load so their labels don't flicker.
  const [presets] = useState(() => presetScenarios(btcPrice));
  const [presetId, setPresetId] = useState<string | null>(presets[0]?.id ?? null);
  const [controls, setControls] = useState<Controls>(() => (presets[0] ? controlsFrom(presets[0]) : blank()));

  const history = useRisk(positions.map((p) => p.assetId));
  const stats = useMemo(() => {
    const out = new Map<string, { beta: number | null; stable: boolean; returns: (number | null)[] }>();
    if (!history) return out;
    const btcR = dailyReturns(history.closes[BTC_ID] ?? []);
    for (const [id, closes] of Object.entries(history.closes)) {
      const r = dailyReturns(closes);
      const recent = r.slice(-BETA_DAYS);
      const lastClose = [...closes].reverse().find((c) => c != null) ?? null;
      out.set(id, {
        beta: id === BTC_ID ? 1 : betaTo(recent, btcR.slice(-BETA_DAYS)),
        stable: lastClose != null && looksStable(lastClose, recent),
        returns: r,
      });
    }
    return out;
  }, [history]);

  const simPositions: SimPosition[] = positions.flatMap((p) => {
    const price = priceOf(p.assetId);
    const r = rows.get(p.assetId);
    if (price == null || !r) return [];
    const s = stats.get(p.assetId);
    return [{ assetId: p.assetId, symbol: r.symbol, quantity: p.quantity, price, beta: s?.beta ?? null, stable: s?.stable }];
  });

  const shocks: Shock[] = [];
  if (controls.btc) shocks.push({ assetId: BTC_ID, ...controls.btc });
  if (controls.all != null) shocks.push({ assetId: "*", kind: "pct", value: controls.all });
  for (const [id, pct] of Object.entries(controls.overrides)) shocks.push({ assetId: id, kind: "pct", value: pct });
  const result = runScenario(simPositions, { shocks, followBtc: controls.follow });

  const risk = useMemo(() => {
    if (!history) return null;
    const values = new Map(simPositions.map((p) => [p.assetId, p.quantity * p.price]));
    const returns = new Map([...stats].map(([id, s]) => [id, s.returns]));
    const total = [...values.values()].reduce((a, b) => a + b, 0);
    let beta = 0;
    let betaKnown = 0;
    for (const p of simPositions) {
      const b = stats.get(p.assetId)?.beta;
      if (b == null) continue;
      beta += (p.quantity * p.price * b) / total;
      betaKnown += (p.quantity * p.price) / total;
    }
    const largest = [...simPositions].sort((a, b) => b.quantity * b.price - a.quantity * a.price)[0];
    return {
      hist: total > 0 ? historicalRisk(values, history.days.slice(1), returns) : null,
      beta: betaKnown > 0.5 ? beta / betaKnown : null,
      largest: largest && total > 0 ? { symbol: largest.symbol, share: (largest.quantity * largest.price) / total } : null,
    };
    // simPositions is rebuilt every render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, stats, JSON.stringify(simPositions.map((p) => [p.assetId, p.quantity, Math.round(p.price)]))]);

  const choose = (s: Scenario) => {
    setPresetId(s.id);
    setControls(controlsFrom(s));
  };
  const edit = (c: Partial<Controls>) => {
    setPresetId(null);
    setControls((cur) => ({ ...cur, ...c }));
  };
  const setQty = (id: string, q: number | null) =>
    setPositions((ps) => ps.map((p) => (p.assetId === id ? { ...p, quantity: q ?? 0 } : p)));

  return (
    <div className="simulator">
      <section className="panel">
        <h2>1. Your holdings</h2>
        {fromPortfolio ? (
          <p className="muted small">
            From <Link href="/portfolio">your portfolio</Link>. Changes here are only for the simulation.
          </p>
        ) : (
          <p className="muted small">
            Saved on this device only. <Link href="/signup?next=/portfolio">Create a free account</Link> to track a real
            portfolio.
          </p>
        )}
        {positions.length === 0 && loaded && (
          <p>
            Add the coins you hold, or{" "}
            <button type="button" className="btn link" onClick={() => setPositions(EXAMPLE)}>
              try an example portfolio
            </button>
            .
          </p>
        )}
        <ul className="positions">
          {positions.map((p) => {
            const r = rows.get(p.assetId);
            return (
              <li key={p.assetId}>
                <CoinLogo src={r?.image ?? null} symbol={r?.symbol ?? "?"} size={20} />
                <span className="name">{r?.name ?? p.assetId}</span>
                <input
                  aria-label={`${r?.symbol ?? p.assetId} quantity`}
                  inputMode="decimal"
                  defaultValue={p.quantity}
                  onChange={(e) => setQty(p.assetId, parse(e.target.value))}
                />
                <span className="sym">{r?.symbol}</span>
                <span className="muted num">{formatUsd((priceOf(p.assetId) ?? 0) * p.quantity)}</span>
                <button
                  type="button"
                  className="btn link small"
                  aria-label={`Remove ${r?.name ?? p.assetId}`}
                  onClick={() => setPositions((ps) => ps.filter((x) => x.assetId !== p.assetId))}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
        <SearchBox
          placeholder="Add a coin"
          onPick={(c) => {
            if (!rows.has(c.id)) setExtra((xs) => [...xs, c]);
            setPositions((ps) => (ps.some((p) => p.assetId === c.id) ? ps : [...ps, { assetId: c.id, quantity: 1 }]));
          }}
        />
      </section>

      <section className="panel">
        <h2>2. Pick a scenario</h2>
        <div className="presets">
          {presets.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`preset ${presetId === s.id ? "on" : ""}`}
              aria-pressed={presetId === s.id}
              onClick={() => choose(s)}
              title={s.description}
            >
              {s.label}
            </button>
          ))}
        </div>
        {presetId && <p className="muted small">{presets.find((s) => s.id === presetId)?.description}</p>}
        <details className="custom" open={presetId == null}>
          <summary>Or set your own</summary>
          <div className="form-row">
            <label>
              Bitcoin
              <span className="input-group">
                <select
                  value={controls.btc?.kind ?? "price"}
                  onChange={(e) =>
                    edit({ btc: { kind: e.target.value as "price" | "pct", value: controls.btc?.value ?? 0 } })
                  }
                >
                  <option value="price">goes to $</option>
                  <option value="pct">moves %</option>
                </select>
                <input
                  key={`btc-${presetId}`}
                  inputMode="decimal"
                  defaultValue={controls.btc?.value ?? ""}
                  placeholder={controls.btc?.kind === "pct" ? "-20" : "70000"}
                  onChange={(e) => {
                    const v = parse(e.target.value);
                    edit({ btc: v == null ? null : { kind: controls.btc?.kind ?? "price", value: v } });
                  }}
                />
              </span>
            </label>
            <label>
              Every other coin moves %
              <input
                key={`all-${presetId}`}
                inputMode="decimal"
                defaultValue={controls.all ?? ""}
                placeholder="e.g. -30"
                onChange={(e) => edit({ all: parse(e.target.value) })}
              />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={controls.follow} onChange={(e) => edit({ follow: e.target.checked })} />
            Coins without their own move follow Bitcoin (by their beta)
          </label>
        </details>
      </section>

      <section className="panel result">
        <h2>3. What happens</h2>
        {simPositions.length === 0 ? (
          <p className="muted">Add a coin above to see the result.</p>
        ) : (
          <>
            <p className="headline">
              {formatUsd(result.value)} would become <strong>{formatUsd(result.newValue)}</strong>{" "}
              <span className={`chg ${result.change >= 0 ? "up" : "down"}`}>
                ({signedUsd(result.change)}, {formatPct(result.pct)})
              </span>
            </p>
            <div className="table-wrap">
              <table className="market">
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th className="num hide-sm">Price now</th>
                    <th className="num">Move</th>
                    <th className="num">New price</th>
                    <th className="num">New value</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.assetId}>
                      <td>
                        {r.symbol}
                        {stats.get(r.assetId)?.stable && <span className="muted small"> · stablecoin</span>}
                        {r.driver === "btc" && (
                          <span className="muted small hide-sm"> · follows BTC × {(stats.get(r.assetId)?.beta ?? 1).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="num hide-sm">{formatUsd(r.price)}</td>
                      <td className="num">
                        <input
                          className="pct-input"
                          aria-label={`${r.symbol} move in %`}
                          inputMode="decimal"
                          key={`${r.assetId}-${presetId}`}
                          placeholder={formatPct(r.pct)}
                          defaultValue={controls.overrides[r.assetId] ?? ""}
                          onChange={(e) => {
                            const v = parse(e.target.value);
                            const overrides = { ...controls.overrides };
                            if (v == null) delete overrides[r.assetId];
                            else overrides[r.assetId] = v;
                            edit({ overrides });
                          }}
                        />
                      </td>
                      <td className="num">{formatUsd(r.newPrice)}</td>
                      <td className="num">
                        <div>{formatUsd(r.newValue)}</div>
                        <div className={`small chg ${r.newValue >= r.value ? "up" : "down"}`}>
                          {signedUsd(r.newValue - r.value)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">Type a % in the Move column to set any coin yourself.</p>
          </>
        )}
      </section>

      {simPositions.length > 0 && (
        <section className="panel">
          <h2>Risk at a glance</h2>
          {!history ? (
            <p className="muted">Loading price history…</p>
          ) : (
            <dl className="stats risk">
              <div>
                <dt>Moves with Bitcoin (beta)</dt>
                <dd>
                  {risk?.beta != null ? (
                    <>
                      {risk.beta.toFixed(2)}
                      <span className="muted small">
                        {" "}
                        · a 10% Bitcoin move has meant about {Math.abs(risk.beta * 10).toFixed(0)}% for these holdings
                      </span>
                    </>
                  ) : (
                    "Not enough history yet"
                  )}
                </dd>
              </div>
              <div>
                <dt>A bad day (1 day in 20)</dt>
                <dd>
                  {risk?.hist ? (
                    <>
                      −{formatUsd(risk.hist.var95)}
                      <span className="muted small"> or worse, based on the last {risk.hist.days} days</span>
                    </>
                  ) : (
                    "Not enough history yet"
                  )}
                </dd>
              </div>
              <div>
                <dt>Worst day in that time</dt>
                <dd>
                  {risk?.hist ? (
                    <>
                      −{formatUsd(risk.hist.worst)}
                      <span className="muted small">
                        {" "}
                        on {new Date(`${risk.hist.worstDay}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Biggest holding</dt>
                <dd>
                  {risk?.largest ? (
                    <>
                      {risk.largest.symbol} {(risk.largest.share * 100).toFixed(0)}%
                      {risk.largest.share > 0.6 && simPositions.length > 1 && (
                        <span className="muted small"> · most of the value rides on one coin</span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          )}
          <p className="muted small">
            These figures replay past prices on today&rsquo;s holdings. The future can be worse. Not financial advice.
          </p>
        </section>
      )}
    </div>
  );
}

/** +$1,234.00 / −$1,234.00 */
function signedUsd(v: number): string {
  return (v >= 0 ? "+" : "−") + formatUsd(Math.abs(v));
}

function blank(): Controls {
  return { btc: null, all: null, follow: true, overrides: {} };
}
