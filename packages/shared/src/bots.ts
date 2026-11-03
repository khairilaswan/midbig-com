/**
 * Bots members can @mention: which bot a message calls, and the replies the
 * rule-based ones write from market data. Pure, so the wording is tested.
 * Every reply ends with the same disclosure line.
 */

import { formatAssetPrice, formatPct, formatUsdCompact, pctChange } from "./index.js";
import { assetClassOf, marketStatus } from "./markets.js";
import { dailyReturns, volatility } from "./simulate.js";
import { findMentions } from "./community.js";

export type BotKind = "price" | "risk" | "pulse" | "ai";

export const BOT_KINDS: Record<BotKind, { name: string; blurb: string }> = {
  price: { name: "Price", blurb: "Latest price, change, range and key figures." },
  risk: { name: "Risk", blurb: "Volatility, drawdowns and worst days over the last year." },
  pulse: { name: "Community pulse", blurb: "What the community talked about and its bull/bear split today." },
  ai: { name: "AI analyst (Claude)", blurb: "A short written take from Claude, with the figures above. Needs ANTHROPIC_API_KEY." },
};

export function isBotKind(s: string): s is BotKind {
  return Object.hasOwn(BOT_KINDS, s);
}

export const BOT_DISCLOSURE = "🤖 Automated reply from a midbig bot. Not financial advice.";

export const BOT_LIMITS = {
  /** Bots one message can call. */
  perMessage: 2,
  /** Bot answers one member can ask for per hour, across all bots. */
  perMemberHour: 20,
  /** Most an AI reply may say. */
  aiMaxTokens: 400,
};

/** The bot handles a message mentions, in order, from the handles that exist. */
export function botsCalled(text: string, handles: string[]): string[] {
  const known = new Map(handles.map((h) => [h.toLowerCase(), h]));
  const out: string[] = [];
  for (const u of findMentions(text).users) {
    const h = known.get(u.toLowerCase());
    if (h && !out.includes(h)) out.push(h);
  }
  return out.slice(0, BOT_LIMITS.perMessage);
}

/** What the price bot needs to know about an asset. */
export interface BotAsset {
  id: string;
  name: string;
  symbol: string;
  price: number | null;
  ref24h: number | null;
  ref7d: number | null;
  marketCap: number | null;
  rank: number | null;
  volume24h: number | null;
  details: Record<string, number | string>;
  ath: number | null;
}

function label(a: { name: string; symbol: string }): string {
  return a.name.toUpperCase() === a.symbol.toUpperCase() ? a.symbol : `${a.name} (${a.symbol})`;
}

function num(v: number | string | undefined): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return n != null && Number.isFinite(n) ? n : null;
}

export function priceReply(a: BotAsset, now = Date.now()): string {
  if (a.price == null) return `I don't have a price for ${label(a)} yet.`;
  const cls = assetClassOf(a.id);
  const px = (v: number) => formatAssetPrice(a.id, v);
  const lines: string[] = [];
  const d1 = pctChange(a.price, a.ref24h);
  const d7 = pctChange(a.price, a.ref7d);
  const moves = [d1 != null && `${formatPct(d1)} ${cls === "stock" ? "today" : "in 24h"}`, d7 != null && `${formatPct(d7)} in 7 days`]
    .filter(Boolean)
    .join(", ");
  lines.push(`${label(a)} is at ${px(a.price)}${moves ? ` (${moves})` : ""}.`);
  if (cls !== "crypto") {
    const status = marketStatus(a.id, now);
    if (status.phase !== "open") lines.push(`${status.label}; that's the last trade.`);
  }
  if (cls === "stock") {
    const lo = num(a.details.day_low);
    const hi = num(a.details.day_high);
    if (lo != null && hi != null) lines.push(`Day range ${px(lo)} to ${px(hi)}.`);
    const w52lo = num(a.details.week52_low);
    const w52hi = num(a.details.week52_high);
    if (w52lo != null && w52hi != null) {
      const off = pctChange(a.price, w52hi);
      lines.push(`52-week range ${px(w52lo)} to ${px(w52hi)}${off != null ? `, ${formatPct(off)} from the high` : ""}.`);
    }
    const pe = num(a.details.pe);
    const dy = num(a.details.dividend_yield);
    const extra = [a.marketCap != null && `market cap ${formatUsdCompact(a.marketCap)}`, pe != null && `P/E ${pe.toFixed(1)}`, dy != null && dy > 0 && `dividend yield ${dy.toFixed(2)}%`]
      .filter(Boolean)
      .join(", ");
    if (extra) lines.push(extra[0]!.toUpperCase() + extra.slice(1) + ".");
  } else if (cls === "crypto") {
    const extra = [
      a.marketCap != null && `market cap ${formatUsdCompact(a.marketCap)}${a.rank ? ` (#${a.rank})` : ""}`,
      a.volume24h != null && `24h volume ${formatUsdCompact(a.volume24h)}`,
    ]
      .filter(Boolean)
      .join(", ");
    if (extra) lines.push(extra[0]!.toUpperCase() + extra.slice(1) + ".");
    if (a.ath != null && a.ath > 0) {
      const off = pctChange(a.price, a.ath);
      if (off != null) lines.push(`${off >= -0.5 ? "At" : `${formatPct(off)} from`} its all-time high of ${px(a.ath)}.`);
    }
  }
  return lines.join(" ");
}

export interface RiskFigures {
  days: number;
  /** Annualised volatility, as a fraction. */
  vol30: number | null;
  vol1y: number | null;
  /** Largest peak-to-trough fall, as a negative fraction, with its dates. */
  maxDrawdown: number;
  drawdownFrom: string;
  drawdownTo: string;
  worstDay: { day: string; r: number } | null;
  bestDay: { day: string; r: number } | null;
  /** Share of days that moved more than 5% either way. */
  bigMoveShare: number;
}

/**
 * Risk figures from daily closes (oldest first). Crypto trades every day, so
 * its volatility is annualised over 365 days; stocks and forex over 252.
 */
export function riskFigures(days: string[], closes: number[], tradingDays = 365): RiskFigures | null {
  if (closes.length < 21 || days.length !== closes.length) return null;
  const rets = dailyReturns(closes);
  const ann = Math.sqrt(tradingDays);
  const v30 = volatility(rets.slice(-30));
  const v1y = volatility(rets);
  let peak = closes[0]!;
  let peakDay = days[0]!;
  let mdd = 0;
  let from = days[0]!;
  let to = days[0]!;
  closes.forEach((c, i) => {
    if (c > peak) {
      peak = c;
      peakDay = days[i]!;
    }
    const dd = c / peak - 1;
    if (dd < mdd) {
      mdd = dd;
      from = peakDay;
      to = days[i]!;
    }
  });
  let worst: RiskFigures["worstDay"] = null;
  let best: RiskFigures["bestDay"] = null;
  let big = 0;
  let n = 0;
  rets.forEach((r, i) => {
    if (r == null) return;
    n++;
    if (Math.abs(r) > 0.05) big++;
    if (!worst || r < worst.r) worst = { day: days[i + 1]!, r };
    if (!best || r > best.r) best = { day: days[i + 1]!, r };
  });
  return {
    days: closes.length,
    vol30: v30 != null ? v30 * ann : null,
    vol1y: v1y != null ? v1y * ann : null,
    maxDrawdown: mdd,
    drawdownFrom: from,
    drawdownTo: to,
    worstDay: worst,
    bestDay: best,
    bigMoveShare: n ? big / n : 0,
  };
}

const pct = (f: number) => formatPct(f * 100).replace(/^\+/, "");
const date = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function riskReply(a: { name: string; symbol: string }, f: RiskFigures | null): string {
  if (!f) return `There isn't enough price history for ${label(a)} yet to measure its risk (I need about a month).`;
  const lines: string[] = [`${label(a)} over the last ${f.days} days:`];
  if (f.vol1y != null) {
    lines.push(
      `volatility ${pct(f.vol1y)} a year${f.vol30 != null ? ` (${pct(f.vol30)} over the last 30 days, ${f.vol30 > f.vol1y * 1.2 ? "choppier than usual" : f.vol30 < f.vol1y * 0.8 ? "calmer than usual" : "about usual"})` : ""}.`,
    );
  }
  if (f.maxDrawdown < 0) lines.push(`Its biggest fall from a high was ${pct(f.maxDrawdown)}, from ${date(f.drawdownFrom)} to ${date(f.drawdownTo)}.`);
  if (f.worstDay) lines.push(`Worst day ${pct(f.worstDay.r)} (${date(f.worstDay.day)})${f.bestDay ? `, best day +${pct(f.bestDay.r)} (${date(f.bestDay.day)})` : ""}.`);
  lines.push(`${Math.round(f.bigMoveShare * 100)}% of days moved more than 5%.`);
  return lines.join(" ");
}

export interface PulseFigures {
  community: string;
  topics: number;
  comments: number;
  bulls: number;
  bears: number;
  top: { title: string; score: number } | null;
  tickers: { symbol: string; n: number }[];
}

export function pulseReply(p: PulseFigures): string {
  if (p.topics === 0 && p.comments === 0) return `${p.community} has been quiet for the last 24 hours. Be the first to post.`;
  const lines = [
    `${p.community} in the last 24 hours: ${p.topics} new ${p.topics === 1 ? "topic" : "topics"} and ${p.comments} ${p.comments === 1 ? "comment" : "comments"}.`,
  ];
  const calls = p.bulls + p.bears;
  if (calls > 0) lines.push(`Calls: ${p.bulls} bullish, ${p.bears} bearish${calls >= 3 ? ` (${Math.round((p.bulls / calls) * 100)}% bulls)` : ""}.`);
  if (p.top) lines.push(`Top post: "${p.top.title}" (${p.top.score >= 0 ? "+" : ""}${p.top.score}).`);
  if (p.tickers.length) lines.push(`Most mentioned: ${p.tickers.slice(0, 5).map((t) => `$${t.symbol} (${t.n})`).join(", ")}.`);
  return lines.join(" ");
}

/** The help line a bot answers with when it can't tell which asset is meant. */
export function botHelp(handle: string, kind: BotKind): string {
  if (kind === "pulse") return `Mention me in a community, like "@${handle} what's the mood?".`;
  return `Tell me which asset, like "@${handle} $BTC" or "@${handle} $AAPL", or mention me inside a coin or stock community.`;
}
