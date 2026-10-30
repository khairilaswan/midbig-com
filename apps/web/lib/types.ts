import type { LivePrice } from "@midbig/shared";

/** One asset as the market tables need it. Serialisable, so it can go to client components. */
export interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number | null;
  marketCap: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  /** Metadata provider's price at its last sync; the fallback when no exchange quotes the asset. */
  refPrice: number | null;
  /** Price 24h / 7d before the last sync, for computing live % changes. */
  ref24h: number | null;
  ref7d: number | null;
  sparkline: number[];
  /** When metadata (and refPrice) was last refreshed, ms since epoch. */
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
}
