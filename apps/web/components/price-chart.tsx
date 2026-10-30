"use client";

import { useEffect, useRef, useState } from "react";
import { AreaSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { assetClassOf, forexDecimals, type LivePrice } from "@midbig/shared";
import { useLivePrice } from "./live";

const RANGES = [
  { key: "1d", label: "24H" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "1y", label: "1Y" },
] as const;
type Range = (typeof RANGES)[number]["key"];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function PriceChart({ id, initialLive }: { id: string; initialLive: LivePrice | null }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lastTime = useRef(0);
  const [range, setRange] = useState<Range>("1d");
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const lp = useLivePrice(id, initialLive);

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: cssVar("--muted"), attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--line") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { labelVisible: true } },
      handleScroll: false,
      handleScale: false,
    });
    const accent = cssVar("--accent");
    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: accent,
      topColor: accent + "55",
      bottomColor: accent + "05",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState("loading");
    fetch(`/api/candles/${encodeURIComponent(id)}?range=${range}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<[number, number][]>;
      })
      .then((points) => {
        const series = seriesRef.current;
        if (!series) return;
        const data = points.map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));
        series.setData(data);
        const maxV = Math.max(...points.map((p) => p[1]), 0);
        const precision =
          assetClassOf(id) === "forex"
            ? forexDecimals(maxV)
            : maxV >= 1
              ? 2
              : Math.min(10, Math.max(4, -Math.floor(Math.log10(maxV || 1)) + 3));
        series.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
        lastTime.current = data.at(-1)?.time ?? 0;
        chartRef.current?.timeScale().fitContent();
        setState(data.length > 0 ? "ready" : "empty");
      })
      .catch((err) => {
        if (err.name !== "AbortError") setState("error");
      });
    return () => ctrl.abort();
  }, [id, range]);

  // Extend the 24h chart with live trades, one point per minute.
  useEffect(() => {
    if (range !== "1d" || !lp || !seriesRef.current || state === "loading") return;
    const minute = (Math.floor(lp.t / 60_000) * 60) as UTCTimestamp;
    if (minute < lastTime.current) return;
    seriesRef.current.update({ time: minute, value: lp.p });
    lastTime.current = minute;
  }, [lp, range, state]);

  return (
    <section className="chart-card">
      <div className="chart-head">
        <h2>Price chart</h2>
        <div className="ranges" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button key={r.key} role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart" ref={el}>
        {state === "empty" && (
          <p className="chart-msg">No history yet for this range. It fills in as trades arrive during market hours.</p>
        )}
        {state === "error" && <p className="chart-msg">Couldn&apos;t load the chart. Try again in a moment.</p>}
      </div>
    </section>
  );
}
