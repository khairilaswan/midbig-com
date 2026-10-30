import "server-only";
import webpush from "web-push";
import { assetClassOf, VAPID_PRIVATE, VAPID_PUBLIC, type AlertDirection, type PushPayload, type Txn } from "@midbig/shared";
import { cached, livePrices, pool, ROW_COLUMNS, toRow, type RowRecord } from "./server";
import { SITE_URL } from "./site";
import type { AssetRow } from "./types";

/** Assets by id with live prices, in the order given. */
export async function getAssetRows(ids: string[]): Promise<AssetRow[]> {
  if (ids.length === 0) return [];
  const [res, live] = await Promise.all([
    pool().query<RowRecord>(`SELECT ${ROW_COLUMNS} FROM assets WHERE id = ANY($1)`, [ids]),
    livePrices(ids),
  ]);
  const byId = new Map(res.rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [toRow(r, live.get(id))] : [];
  });
}

export async function getWatchlistIds(userId: string): Promise<string[]> {
  const res = await pool().query<{ asset_id: string }>(
    `SELECT w.asset_id FROM watchlist w JOIN assets a ON a.id = w.asset_id
     WHERE w.user_id = $1 ORDER BY a.market_cap_rank NULLS LAST, w.added_at`,
    [userId],
  );
  return res.rows.map((r) => r.asset_id);
}

export async function isWatched(userId: string, assetId: string): Promise<boolean> {
  const res = await pool().query(`SELECT 1 FROM watchlist WHERE user_id = $1 AND asset_id = $2`, [userId, assetId]);
  return (res.rowCount ?? 0) > 0;
}

export interface TxnRow extends Txn {
  id: string;
  note: string | null;
}

export async function getTxns(userId: string): Promise<TxnRow[]> {
  const res = await pool().query<{
    id: string;
    asset_id: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    fee: number;
    executed_at: Date;
    note: string | null;
  }>(
    `SELECT id::text, asset_id, side, quantity, price, fee, executed_at, note
     FROM portfolio_txns WHERE user_id = $1 ORDER BY executed_at DESC, id DESC`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    side: r.side,
    quantity: r.quantity,
    price: r.price,
    fee: r.fee,
    executedAt: r.executed_at.getTime(),
    note: r.note,
  }));
}

export interface AlertRow {
  id: string;
  assetId: string;
  direction: AlertDirection;
  target: number;
  notifyEmail: boolean;
  createdAt: number;
  triggeredAt: number | null;
  triggeredPrice: number | null;
}

export async function getAlerts(userId: string): Promise<AlertRow[]> {
  const res = await pool().query<{
    id: string;
    asset_id: string;
    direction: AlertDirection;
    target: number;
    notify_email: boolean;
    created_at: Date;
    triggered_at: Date | null;
    triggered_price: number | null;
  }>(
    `SELECT id::text, asset_id, direction, target, notify_email, created_at, triggered_at, triggered_price
     FROM price_alerts WHERE user_id = $1
     ORDER BY triggered_at IS NOT NULL, triggered_at DESC, created_at DESC LIMIT 200`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    direction: r.direction,
    target: r.target,
    notifyEmail: r.notify_email,
    createdAt: r.created_at.getTime(),
    triggeredAt: r.triggered_at?.getTime() ?? null,
    triggeredPrice: r.triggered_price,
  }));
}

export interface RiskHistory {
  /** Days, oldest first, as YYYY-MM-DD. */
  days: string[];
  /** Daily close per asset on each day, null where missing. */
  closes: Record<string, (number | null)[]>;
}

/**
 * Daily closes for the last year: our own daily candles where we have them,
 * the backfilled history before that. Today is left out because it's not
 * closed yet.
 */
export async function getRiskHistory(ids: string[]): Promise<RiskHistory> {
  const sorted = [...new Set(ids)].sort();
  return cached(`risk:${sorted.join(",")}`, 3600_000, async () => {
    const res = await pool().query<{ asset_id: string; day: string; close: number }>(
      `SELECT DISTINCT ON (asset_id, day) asset_id, to_char(day, 'YYYY-MM-DD') AS day, close FROM (
         SELECT asset_id, (ts AT TIME ZONE 'UTC')::date AS day, close, 1 AS pri FROM candles_1d
         WHERE asset_id = ANY($1) AND ts >= now() - interval '366 days'
         UNION ALL
         SELECT asset_id, day, close, 2 FROM history_daily
         WHERE asset_id = ANY($1) AND day >= (now() - interval '366 days')::date
       ) x
       WHERE day < (now() AT TIME ZONE 'UTC')::date
       ORDER BY asset_id, day, pri`,
      [sorted],
    );
    const days = [...new Set(res.rows.map((r) => r.day))].sort();
    const index = new Map(days.map((d, i) => [d, i]));
    const closes: Record<string, (number | null)[]> = {};
    for (const id of sorted) closes[id] = new Array(days.length).fill(null);
    for (const r of res.rows) closes[r.asset_id]![index.get(r.day)!] = r.close;
    // Stocks and forex don't trade on weekends and holidays: carry the last close over those days, so the
    // next trading day's move counts and the closed days count as no move, like a coin that stood still.
    for (const id of sorted) {
      if (assetClassOf(id) === "crypto") continue;
      const c = closes[id]!;
      for (let i = 1; i < c.length; i++) if (c[i] == null && c[i - 1] != null) c[i] = c[i - 1]!;
    }
    return { days, closes };
  });
}

/**
 * The web push key pair. The first service to need it generates it; both
 * read it from the database after that. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * override it.
 */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  return cached("vapid", 3600_000, async () => {
    const read = async () => {
      const res = await pool().query<{ name: string; value: string }>(
        `SELECT name, value FROM app_secrets WHERE name = ANY($1)`,
        [[VAPID_PUBLIC, VAPID_PRIVATE]],
      );
      const m = new Map(res.rows.map((r) => [r.name, r.value]));
      const publicKey = m.get(VAPID_PUBLIC);
      const privateKey = m.get(VAPID_PRIVATE);
      return publicKey && privateKey ? { publicKey, privateKey } : null;
    };
    const found = await read();
    if (found) return found;
    const keys = webpush.generateVAPIDKeys();
    await pool().query(
      `INSERT INTO app_secrets (name, value) VALUES ($1, $2), ($3, $4) ON CONFLICT (name) DO NOTHING`,
      [VAPID_PUBLIC, keys.publicKey, VAPID_PRIVATE, keys.privateKey],
    );
    // Another process may have won the race; use whatever is stored.
    return (await read())!;
  });
}

export function vapidSubject(): string {
  return SITE_URL.startsWith("https://") ? SITE_URL : "mailto:alerts@midbig.com";
}

/** Sends a push to every device of a user, dropping subscriptions the browser has revoked. */
export async function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  const keys = await vapidKeys();
  const subs = await pool().query<{ endpoint: string; p256dh: string; auth: string }>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  let sent = 0;
  await Promise.all(
    subs.rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { vapidDetails: { subject: vapidSubject(), ...keys }, TTL: 3600 },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await pool().query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [s.endpoint]);
        } else console.error("push failed", err);
      }
    }),
  );
  return sent;
}
