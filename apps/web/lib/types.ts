import type { AssetClass, ChatMessage, LivePrice } from "@midbig/shared";

/** One asset as the market tables need it. Serialisable, so it can go to client components. */
export interface AssetRow {
  id: string;
  assetClass: AssetClass;
  /** Industry, for stocks. */
  sector: string | null;
  /** A stock's beta against the S&P 500, from the provider. */
  beta: number | null;
  symbol: string;
  name: string;
  image: string | null;
  rank: number | null;
  marketCap: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  /** Metadata provider's price at its last sync; the fallback when no exchange quotes the asset. */
  refPrice: number | null;
  /** Price 24h / 7d before the last sync (a stock's previous close), for computing live % changes. */
  ref24h: number | null;
  ref7d: number | null;
  sparkline: number[];
  /** When refPrice was last refreshed, ms since epoch. */
  metadataAt: number | null;
  live: LivePrice | null;
}

export interface AssetDetail extends AssetRow {
  fdv: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athDate: number | null;
  atl: number | null;
  atlDate: number | null;
  exchange: string | null;
  /** Stock figures: pe, beta, dividend_yield, week52_high, week52_low, prev_close, day_high, day_low, avg_volume_10d, website. */
  details: Record<string, number | string>;
}

/** Why someone can't post in chat yet. */
export type PostBlock =
  | { reason: "login" }
  | { reason: "name" }
  | { reason: "new"; until: number }
  | { reason: "banned"; until: number | null };

/** What a chat room sends the browser when it opens. */
export interface ChatState {
  messages: ChatMessage[];
  /** User ids the viewer muted. */
  muted: string[];
  me: {
    id: string;
    name: string | null;
    isStaff: boolean;
    /** Staff with two-factor login on. */
    canModerate: boolean;
    block: PostBlock | null;
  } | null;
  /** Turnstile site key when the first-message bot check is on. */
  captchaSiteKey: string | null;
}
