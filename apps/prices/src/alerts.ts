import type pg from "pg";
import webpush from "web-push";
import {
  alertHit,
  assetPath,
  formatAssetPrice,
  sendEmail,
  VAPID_PRIVATE,
  VAPID_PUBLIC,
  type AlertDirection,
  type PushPayload,
} from "@midbig/shared";
import { logger } from "./log.js";
import type { MarketState } from "./market.js";

const log = logger("alerts");

/** How often waiting alerts are checked against the latest prices. */
const CHECK_EVERY_MS = 5_000;

interface Waiting {
  id: string;
  user_id: string;
  asset_id: string;
  direction: AlertDirection;
  target: number;
  notify_email: boolean;
  ref_price: number | null;
  metadata_ms: number | null;
}

export interface AlertConfig {
  siteUrl: string;
  resendApiKey: string;
  emailFrom: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

/**
 * Checks price alerts every few seconds. Exchange prices come straight from
 * the feeds; coins no exchange quotes use CoinGecko's price. An alert fires
 * once: it is marked triggered in the same statement that claims it, so two
 * running services can't both send it.
 */
export function startAlertChecker(state: MarketState, pool: pg.Pool, cfg: AlertConfig): () => Promise<void> {
  let busy: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (busy) return;
    busy = check(state, pool, cfg)
      .catch((err) => log.error("alert check failed", err))
      .finally(() => (busy = null));
  }, CHECK_EVERY_MS);
  return async () => {
    clearInterval(timer);
    await busy;
  };
}

/** Price to judge an alert by: whichever of the exchange and CoinGecko prices is newer. */
export function currentPrice(state: MarketState, a: Pick<Waiting, "asset_id" | "ref_price" | "metadata_ms">): number | null {
  const lp = state.get(a.asset_id);
  if (lp && (a.metadata_ms == null || lp.asOf >= a.metadata_ms || a.ref_price == null)) return lp.p;
  return a.ref_price;
}

async function check(state: MarketState, pool: pg.Pool, cfg: AlertConfig): Promise<void> {
  const res = await pool.query<Waiting>(
    `SELECT p.id::text, p.user_id, p.asset_id, p.direction, p.target, p.notify_email, a.ref_price,
            (extract(epoch FROM COALESCE(a.quote_updated_at, a.metadata_updated_at)) * 1000)::float8 AS metadata_ms
     FROM price_alerts p JOIN assets a ON a.id = p.asset_id
     WHERE p.triggered_at IS NULL`,
  );
  for (const a of res.rows) {
    const price = currentPrice(state, a);
    if (price == null || !alertHit(a.direction, a.target, price)) continue;
    const claimed = await pool.query(
      `UPDATE price_alerts SET triggered_at = now(), triggered_price = $2 WHERE id = $1 AND triggered_at IS NULL`,
      [a.id, price],
    );
    if (claimed.rowCount !== 1) continue;
    await notify(pool, cfg, a, price).catch((err) => log.error(`alert ${a.id} notify failed`, err));
  }
}

async function notify(pool: pg.Pool, cfg: AlertConfig, a: Waiting, price: number): Promise<void> {
  const info = await pool.query<{ symbol: string; name: string; email: string }>(
    `SELECT a.symbol, a.name, u.email FROM assets a, "user" u WHERE a.id = $1 AND u.id = $2`,
    [a.asset_id, a.user_id],
  );
  const row = info.rows[0];
  if (!row) return;
  const sym = row.symbol.toUpperCase();
  const fmt = (v: number) => formatAssetPrice(a.asset_id, v);
  const title = `${sym} is ${a.direction} ${fmt(a.target)}`;
  const body = `${row.name} is at ${fmt(price)}. Your alert for ${a.direction} ${fmt(a.target)} was hit.`;
  const path = assetPath(a.asset_id);
  const payload: PushPayload = { title, body, url: path, tag: `alert-${a.id}` };

  const sent = await pushToUser(pool, cfg, a.user_id, payload);
  if (a.notify_email) {
    const emailed = await sendEmail({
      apiKey: cfg.resendApiKey,
      from: cfg.emailFrom,
      to: row.email,
      subject: title,
      text: `${body}\n\n${cfg.siteUrl}${path}\n\nManage your alerts: ${cfg.siteUrl}/alerts`,
    });
    if (!emailed) log.warn(`alert ${a.id} wanted email but RESEND_API_KEY is not set`);
  }
  log.info(`alert ${a.id} fired: ${title} (${sent} device(s))`);
}

async function vapidKeys(pool: pg.Pool, cfg: AlertConfig): Promise<{ publicKey: string; privateKey: string } | null> {
  if (cfg.vapidPublicKey && cfg.vapidPrivateKey) {
    return { publicKey: cfg.vapidPublicKey, privateKey: cfg.vapidPrivateKey };
  }
  // The web app creates these when someone first turns notifications on.
  const res = await pool.query<{ name: string; value: string }>(
    `SELECT name, value FROM app_secrets WHERE name = ANY($1)`,
    [[VAPID_PUBLIC, VAPID_PRIVATE]],
  );
  const m = new Map(res.rows.map((r) => [r.name, r.value]));
  const publicKey = m.get(VAPID_PUBLIC);
  const privateKey = m.get(VAPID_PRIVATE);
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

async function pushToUser(pool: pg.Pool, cfg: AlertConfig, userId: string, payload: PushPayload): Promise<number> {
  const subs = await pool.query<{ endpoint: string; p256dh: string; auth: string }>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  if (subs.rows.length === 0) return 0;
  const keys = await vapidKeys(pool, cfg);
  if (!keys) return 0;
  const subject = cfg.siteUrl.startsWith("https://") ? cfg.siteUrl : "mailto:alerts@midbig.com";
  let sent = 0;
  for (const s of subs.rows) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject, ...keys }, TTL: 3600 },
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [s.endpoint]);
      } else log.warn(`push to a device failed (${code ?? "network"})`);
    }
  }
  return sent;
}
