/**
 * Historical stress tests: past market crashes replayed on today's holdings,
 * and the worst drop the holdings would have had over the stored history.
 */

import { BTC_ID, SPX_ID, type Scenario } from "./simulate.js";

export interface HistoricalEvent extends Scenario {
  /** "Feb – Mar 2020" */
  period: string;
  /** Crypto didn't exist yet, so coins stay put. */
  stocksOnly?: boolean;
}

/**
 * Peak-to-trough moves from daily closes, each asset at its own worst point
 * within the period, rounded. Coins without a figure here follow Bitcoin by
 * today's beta (most of them didn't trade back then); stocks follow the
 * S&P 500 by their beta.
 */
export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  {
    id: "covid-2020",
    label: "COVID crash",
    period: "Feb – Mar 2020",
    description:
      "Markets priced in a global shutdown in four weeks. The S&P 500 fell about 34% and Bitcoin about half, most of it on 12 March.",
    shocks: [
      { assetId: SPX_ID, kind: "pct", value: -34 },
      { assetId: BTC_ID, kind: "pct", value: -50 },
      { assetId: "ethereum", kind: "pct", value: -60 },
    ],
    followBtc: true,
  },
  {
    id: "winter-2022",
    label: "2022 crypto winter",
    period: "Nov 2021 – Nov 2022",
    description:
      "Rate rises ended the 2021 boom. Bitcoin lost about 77% from its peak, Ethereum about 79% and Solana about 95%; the S&P 500 fell about 25%.",
    shocks: [
      { assetId: SPX_ID, kind: "pct", value: -25 },
      { assetId: BTC_ID, kind: "pct", value: -77 },
      { assetId: "ethereum", kind: "pct", value: -79 },
      { assetId: "solana", kind: "pct", value: -95 },
    ],
    followBtc: true,
  },
  {
    id: "terra-2022",
    label: "Terra (LUNA) collapse",
    period: "May 2022",
    description:
      "The UST stablecoin lost its peg and LUNA went to almost zero in a week. Bitcoin fell about 27%, Ethereum about 33%, the S&P 500 about 9%.",
    shocks: [
      { assetId: SPX_ID, kind: "pct", value: -9 },
      { assetId: BTC_ID, kind: "pct", value: -27 },
      { assetId: "ethereum", kind: "pct", value: -33 },
    ],
    followBtc: true,
  },
  {
    id: "ftx-2022",
    label: "FTX collapse",
    period: "Nov 2022",
    description:
      "The FTX exchange failed in days. Bitcoin fell about 25%, Ethereum about 30% and Solana, tied to FTX, about 65%. Stocks barely moved.",
    shocks: [
      { assetId: BTC_ID, kind: "pct", value: -25 },
      { assetId: "ethereum", kind: "pct", value: -30 },
      { assetId: "solana", kind: "pct", value: -65 },
    ],
    followBtc: true,
  },
  {
    id: "bust-2018",
    label: "2018 crypto bust",
    period: "Dec 2017 – Dec 2018",
    description:
      "The ICO bubble burst. Bitcoin lost about 84% and Ethereum about 94%; the S&P 500 fell about 20% late in the year.",
    shocks: [
      { assetId: SPX_ID, kind: "pct", value: -20 },
      { assetId: BTC_ID, kind: "pct", value: -84 },
      { assetId: "ethereum", kind: "pct", value: -94 },
    ],
    followBtc: true,
  },
  {
    id: "gfc-2008",
    label: "2008 financial crisis",
    period: "Oct 2007 – Mar 2009",
    description: "The housing and banking crash. The S&P 500 fell about 57%. Crypto didn't exist yet, so coins stay put.",
    shocks: [{ assetId: SPX_ID, kind: "pct", value: -57 }],
    followBtc: false,
    stocksOnly: true,
  },
  {
    id: "dotcom-2000",
    label: "Dot-com bust",
    period: "Mar 2000 – Oct 2002",
    description: "Tech stocks deflated for two and a half years. The S&P 500 fell about 49%. Coins stay put.",
    shocks: [{ assetId: SPX_ID, kind: "pct", value: -49 }],
    followBtc: false,
    stocksOnly: true,
  },
  {
    id: "bull-2021",
    label: "2020–21 bull run",
    period: "Mar 2020 – Nov 2021",
    description:
      "And the other way: from the COVID low to the 2021 peak, Bitcoin rose about 1,270%, Ethereum about 4,270% and the S&P 500 about 114%.",
    shocks: [
      { assetId: SPX_ID, kind: "pct", value: 114 },
      { assetId: BTC_ID, kind: "pct", value: 1270 },
      { assetId: "ethereum", kind: "pct", value: 4270 },
    ],
    followBtc: true,
  },
];

export interface Drawdown {
  /** Fall from the peak to the trough, as a positive percent. */
  pct: number;
  /** Days (YYYY-MM-DD) of the peak and the trough. */
  peakDay: string;
  troughDay: string;
  /** First day after the trough the value was back at the peak, if it got there. */
  recoveredDay: string | null;
  days: number;
}

/**
 * The biggest peak-to-trough fall today's holdings would have had over the
 * stored daily closes. An asset counts at its first known close until it has
 * data, and at its last close on days it's missing.
 */
export function worstDrawdown(
  quantities: Map<string, number>,
  days: string[],
  closes: Record<string, (number | null)[]>,
): Drawdown | null {
  const series: number[][] = [];
  for (const [id, q] of quantities) {
    const c = closes[id];
    if (!c || q <= 0) continue;
    const first = c.find((x) => x != null);
    if (first == null) continue;
    let last = first;
    series.push(c.map((x) => (last = x ?? last) * q));
  }
  if (series.length === 0 || days.length < 2) return null;

  const value = days.map((_, i) => series.reduce((s, v) => s + (v[i] ?? 0), 0));
  let peak = 0;
  let best: { pct: number; peak: number; trough: number } | null = null;
  for (let i = 0; i < value.length; i++) {
    if (value[i]! > value[peak]!) peak = i;
    const pct = value[peak]! > 0 ? (1 - value[i]! / value[peak]!) * 100 : 0;
    if (!best || pct > best.pct) best = { pct, peak, trough: i };
  }
  if (!best || best.pct <= 0) return null;
  let recovered: number | null = null;
  for (let i = best.trough + 1; i < value.length; i++) {
    if (value[i]! >= value[best.peak]!) {
      recovered = i;
      break;
    }
  }
  return {
    pct: best.pct,
    peakDay: days[best.peak]!,
    troughDay: days[best.trough]!,
    recoveredDay: recovered == null ? null : days[recovered]!,
    days: days.length,
  };
}
