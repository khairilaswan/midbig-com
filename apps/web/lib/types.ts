import type { AssetClass, ChatBadge, ChatMessage, FilterReason, LivePrice, ReportReason, Stance, VoteValue } from "@midbig/shared";

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

export interface ForumAuthor {
  id: string;
  name: string;
  badge: ChatBadge;
  reputation: number;
  verified: boolean;
}

export interface TopicSummary {
  id: string;
  title: string;
  path: string;
  community: { id: string; label: string; path: string; title: string };
  assetId: string | null;
  assetSymbol: string | null;
  author: ForumAuthor;
  /** Visible comments. */
  replies: number;
  /** Net votes on the opening post. */
  score: number;
  /** The viewer's vote on the opening post. */
  myVote: VoteValue;
  firstPostId: string | null;
  stance: Stance | null;
  lastPostAt: number;
  createdAt: number;
  pinned: boolean;
  locked: boolean;
  status: "visible" | "held" | "removed";
}

export interface ForumPost {
  id: string;
  topicId: string;
  /** The comment this answers; null for the opening post and top-level comments. */
  parentId: string | null;
  depth: number;
  isFirst: boolean;
  author: ForumAuthor;
  body: string;
  createdAt: number;
  editedAt: number | null;
  score: number;
  myVote: VoteValue;
  status: "visible" | "held" | "removed";
  mine: boolean;
  /** The author's own post, still in its first hour. */
  canEdit: boolean;
}

export interface Profile extends ForumAuthor {
  bio: string | null;
  joined: number;
  trusted: boolean;
  topics: number;
  replies: number;
  /** Net votes on the member's visible posts. */
  scoreReceived: number;
  recent: (ForumPost & { topicTitle: string; topicPath: string })[];
}

export interface ForumQueueItem extends ForumPost {
  topicTitle: string;
  topicPath: string;
  communityLabel: string;
  heldBy: "filter" | "reports" | null;
  flags: FilterReason[];
  reports: { reason: ReportReason; n: number }[];
  authorJoined: number;
  authorPosts: number;
}

/** The signed-in person, for the forum's buttons and forms. */
export interface ForumMe {
  id: string;
  /** Can moderate here: site staff, or this community's moderators (both with two-factor login). */
  canModerate: boolean;
  /** Site staff with two-factor login: can also ban. */
  isSiteMod: boolean;
  block: PostBlock | null;
  /** Why this account can't upvote or downvote yet. */
  voteBlock: string | null;
  downBlock: string | null;
}
