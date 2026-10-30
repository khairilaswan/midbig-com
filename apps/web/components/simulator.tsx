"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  assetClassOf,
  betaTo,
  BTC_ID,
  dailyReturns,
  formatPct,
  formatUsd,
  HISTORICAL_EVENTS,
  historicalRisk,
  looksStable,
  presetScenarios,
  runScenario,
  SPX_ID,
  type Scenario,
  type Shock,
  type SimPosition,
  worstDrawdown,
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
  /** A stock's beta against the S&P 500. */
  beta?: number | null;
}

interface Position {
  assetId: string;
  quantity: number;
}

interface Controls {
  btc: { kind: "price" | "pct"; value: number } | null;
  /** % move for every coin without its own (stablecoins excluded). */
  all: number | null;
  /** % move for the S&P 500; stocks follow it by their beta. */
  spx: number | null;
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
  const spx = s.shocks.find((x) => x.assetId === SPX_ID);
  // Other coins' own moves (a historical event's Ethereum figure) show in the table's Move column.
  const overrides: Record<string, number> = {};
  for (const x of s.shocks) {
    if (x.kind === "pct" && x.assetId !== BTC_ID && x.assetId !== "*" && x.assetId !== SPX_ID) overrides[x.assetId] = x.value;
  }
  return {
    btc: btc ? { kind: btc.kind, value: btc.value } : null,
    all: all ? all.value : null,
    spx: spx ? spx.value : null,
    follow: s.followBtc,
    overrides,
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
      const isStock = assetClassOf(id) === "stock";
      const row = rows.get(id);
      out.set(id, {
        // Stocks use the provider's beta against the S&P 500; coins are measured against Bitcoin here.
        beta: isStock ? (row?.beta ?? null) : id === BTC_ID ? 1 : betaTo(recent, btcR.slice(-BETA_DAYS)),
        stable: !isStock && lastClose != null && looksStable(lastClose, recent),
        returns: r,
      });
    }
    return out;
  }, [history, rows]);

  const simPositions: SimPosition[] = positions.flatMap((p) => {
    const price = priceOf(p.assetId);
    const r = rows.get(p.assetId);
    if (price == null || !r) return [];
    const s = stats.get(p.assetId);
    const assetClass = assetClassOf(p.assetId) === "stock" ? "stock" : "crypto";
    const beta = assetClass === "stock" ? (s?.beta ?? r.beta ?? null) : (s?.beta ?? null);
    return [{ assetId: p.assetId, symbol: r.symbol, quantity: p.quantity, price, beta, stable: s?.stable, assetClass }];
  });

  const shocks: Shock[] = [];
  if (controls.btc) shocks.push({ assetId: BTC_ID, ...controls.btc });
  if (controls.all != null) shocks.push({ assetId: "*", kind: "pct", value: controls.all });
  if (controls.spx != null) shocks.push({ assetId: SPX_ID, kind: "pct", value: controls.spx });
  for (const [id, pct] of Object.entries(controls.overrides)) shocks.push({ assetId: id, kind: "pct", value: pct });
  const result = runScenario(simPositions, { shocks, followBtc: controls.follow });

  const risk = useMemo(() => {
    if (!history) return null;
    const values = new Map(simPositions.map((p) => [p.assetId, p.quantity * p.price]));
    const returns = new Map([...stats].map(([id, s]) => [id, s.returns]));
    const total = [...values.values()].reduce((a, b) => a + b, 0);
    // Beta of the coins against Bitcoin and of the stocks against the S&P 500, each over its own part.
    const groupBeta = (cls: "crypto" | "stock") => {
      const group = simPositions.filter((p) => (p.assetClass ?? "crypto") === cls);
      const sub = group.reduce((a, p) => a + p.quantity * p.price, 0);
      let beta = 0;
      let known = 0;
      for (const p of group) {
        const b = p.beta;
        if (b == null) continue;
        beta += (p.quantity * p.price * b) / sub;
        known += (p.quantity * p.price) / sub;
      }
      return sub > 0 && known > 0.5 ? { beta: beta / known, share: sub / total } : null;
    };
    const largest = [...simPositions].sort((a, b) => b.quantity * b.price - a.quantity * a.price)[0];
    return {
      hist: total > 0 ? historicalRisk(values, history.days.slice(1), returns) : null,
      beta: total > 0 ? groupBeta("crypto") : null,
      spxBeta: total > 0 ? groupBeta("stock") : null,
      largest: largest && total > 0 ? { symbol: largest.symbol, share: (largest.quantity * largest.price) / total } : null,
    };
    // simPositions is rebuilt every render; its inputs are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, stats, JSON.stringify(simPositions.map((p) => [p.assetId, p.quantity, Math.round(p.price), p.beta]))]);

  const stress = useMemo(
    () =>
      HISTORICAL_EVENTS.map((e) => ({ event: e, result: runScenario(simPositions, e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(simPositions.map((p) => [p.assetId, p.quantity, Math.round(p.price), p.beta, p.stable]))],
  );
  const drawdown = useMemo(() => {
    if (!history) return null;
    const quantities = new Map(positions.filter((p) => p.quantity > 0).map((p) => [p.assetId, p.quantity]));
    return worstDrawdown(quantities, history.days, history.closes);
  }, [history, positions]);
  const scenario = presetId ? [...presets, ...HISTORICAL_EVENTS].find((s) => s.id === presetId) : null;

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
            Add the coins and stocks you hold, or{" "}
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
          placeholder="Add a coin or stock"
          classes={["crypto", "stock"]}
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
        <h3 className="small-head">Or replay a past crash</h3>
        <div className="presets">
          {HISTORICAL_EVENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`preset ${presetId === s.id ? "on" : ""}`}
              aria-pressed={presetId === s.id}
              onClick={() => choose(s)}
              title={s.description}
            >
              {s.label} <span className="muted small">{s.period}</span>
            </button>
          ))}
        </div>
        {scenario && <p className="muted small">{scenario.description}</p>}
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
              S&amp;P 500 moves %
              <input
                key={`spx-${presetId}`}
                inputMode="decimal"
                defaultValue={controls.spx ?? ""}
                placeholder="e.g. -20"
                onChange={(e) => edit({ spx: parse(e.target.value) })}
              />
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
            Coins without their own move follow Bitcoin (by their beta). Stocks always follow the S&amp;P 500.
          </label>
        </details>
      </section>

      <section className="panel result">
        <h2>3. What happens</h2>
        {simPositions.length === 0 ? (
          <p className="muted">Add a coin or stock above to see the result.</p>
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
                    <th>Asset</th>
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
                        {r.driver === "spx" && (
                          <span className="muted small hide-sm">
                            {" "}
                            · follows S&amp;P 500 × {(simPositions.find((p) => p.assetId === r.assetId)?.beta ?? 1).toFixed(2)}
                          </span>
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
            <p className="muted small">Type a % in the Move column to set any coin or stock yourself.</p>
          </>
        )}
      </section>

      {simPositions.length > 0 && (
        <section className="panel stress">
          <h2>Stress test: past crashes on today&rsquo;s holdings</h2>
          <div className="table-wrap">
            <table className="market">
              <thead>
                <tr>
                  <th>Event</th>
                  <th className="num">Your holdings</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {stress.map(({ event, result: r }) => (
                  <tr key={event.id} className={presetId === event.id ? "on" : undefined}>
                    <td>
                      <button type="button" className="btn link" onClick={() => choose(event)}>
                        {event.label}
                      </button>
                      <span className="muted small"> · {event.period}</span>
                    </td>
                    <td className="num">{formatUsd(r.newValue)}</td>
                    <td className={`num chg ${r.change >= 0 ? "up" : "down"}`}>
                      {signedUsd(r.change)}
                      <div className="small">{formatPct(r.pct)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small">
            {!history ? (
              <span className="muted">Loading your worst stretch…</span>
            ) : drawdown ? (
              <>
                Worst stretch in the last {drawdown.days} days: <strong>−{drawdown.pct.toFixed(1)}%</strong>{" "}
                <span className="muted">
                  (about −{formatUsd((result.value * drawdown.pct) / 100)} at today&rsquo;s value) from {day(drawdown.peakDay)} to{" "}
                  {day(drawdown.troughDay)}
                  {drawdown.recoveredDay ? `, back to the peak by ${day(drawdown.recoveredDay)}` : ", not yet back to that peak"}.
                </span>
              </>
            ) : (
              <span className="muted">Not enough price history yet for your worst stretch.</span>
            )}
          </p>
          <p className="muted small">
            Each event uses the size of the fall from peak to bottom in daily closes, rounded. Coins without their own
            figure follow Bitcoin by today&rsquo;s beta and stocks follow the S&amp;P 500 by theirs, so this shows how
            today&rsquo;s holdings would fare in a repeat, not what happened to each one. Click an event to see it coin
            by coin.
          </p>
        </section>
      )}

      {simPositions.length > 0 && (
        <section className="panel">
          <h2>Risk at a glance</h2>
          {!history ? (
            <p className="muted">Loading price history…</p>
          ) : (
            <dl className="stats risk">
              {(risk?.beta || !risk?.spxBeta) && (
                <div>
                  <dt>Coins: moves with Bitcoin (beta)</dt>
                  <dd>
                    {risk?.beta != null ? (
                      <>
                        {risk.beta.beta.toFixed(2)}
                        <span className="muted small">
                          {" "}
                          · a 10% Bitcoin move has meant about {Math.abs(risk.beta.beta * 10).toFixed(0)}% for your coins
                        </span>
                      </>
                    ) : (
                      "Not enough history yet"
                    )}
                  </dd>
                </div>
              )}
              {risk?.spxBeta && (
                <div>
                  <dt>Stocks: moves with the S&amp;P 500 (beta)</dt>
                  <dd>
                    {risk.spxBeta.beta.toFixed(2)}
                    <span className="muted small">
                      {" "}
                      · a 10% market move has meant about {Math.abs(risk.spxBeta.beta * 10).toFixed(0)}% for your stocks
                    </span>
                  </dd>
                </div>
              )}
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
                        <span className="muted small"> · most of the value rides on one holding</span>
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

function day(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

/** +$1,234.00 / −$1,234.00 */
function signedUsd(v: number): string {
  return (v >= 0 ? "+" : "−") + formatUsd(Math.abs(v));
}

function blank(): Controls {
  return { btc: null, all: null, spx: null, follow: true, overrides: {} };
}
