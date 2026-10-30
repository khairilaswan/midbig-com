"use server";

import {
  alertHit,
  computeHoldings,
  formatUsd,
  MAX_ALERTS_PER_USER,
  MAX_SUBSCRIPTIONS,
  OversellError,
  type AlertDirection,
} from "@midbig/shared";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/server";
import { getAssetRows, getTxns, pushToUser } from "@/lib/user-data";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_TXNS = 2000;

async function userId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new Error("Please log in again.");
  return session.user.id;
}

async function attempt(fn: () => Promise<void | string>): Promise<ActionResult> {
  try {
    const error = await fn();
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "Please log in again.") return { ok: false, error: err.message };
    console.error("action failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

async function assetExists(id: string): Promise<boolean> {
  const res = await pool().query(`SELECT 1 FROM assets WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function setWatched(assetId: string, watched: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    if (!watched) {
      await pool().query(`DELETE FROM watchlist WHERE user_id = $1 AND asset_id = $2`, [uid, assetId]);
      return;
    }
    if (!(await assetExists(assetId))) return "That coin wasn't found.";
    const res = await pool().query<{ n: number }>(`SELECT count(*)::int AS n FROM watchlist WHERE user_id = $1`, [uid]);
    if ((res.rows[0]?.n ?? 0) >= MAX_SUBSCRIPTIONS) return `A watchlist can hold up to ${MAX_SUBSCRIPTIONS} coins.`;
    await pool().query(`INSERT INTO watchlist (user_id, asset_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [uid, assetId]);
  });
}

export interface TxnInput {
  assetId: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  /** ms since epoch */
  executedAt: number;
  note: string;
}

async function oversellMessage(err: OversellError): Promise<string> {
  const res = await pool().query<{ symbol: string }>(`SELECT symbol FROM assets WHERE id = $1`, [err.assetId]);
  const sym = res.rows[0]?.symbol.toUpperCase() ?? err.assetId;
  return `That would sell more ${sym} than you held on ${new Date(err.at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}. Add the buy first, or check the date.`;
}

export async function addTxn(input: TxnInput): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    const t = { ...input, note: input.note.trim().slice(0, 200) };
    if (t.side !== "buy" && t.side !== "sell") return "Choose buy or sell.";
    if (!(Number.isFinite(t.quantity) && t.quantity > 0)) return "Enter how many coins.";
    if (!(Number.isFinite(t.price) && t.price >= 0)) return "Enter the price per coin.";
    if (!(Number.isFinite(t.fee) && t.fee >= 0)) return "The fee can't be negative.";
    if (!Number.isFinite(t.executedAt) || t.executedAt > Date.now() + 86_400_000 || t.executedAt < Date.UTC(2009, 0, 1)) {
      return "Pick a date between 2009 and today.";
    }
    if (!(await assetExists(t.assetId))) return "Pick a coin from the list.";
    const txns = await getTxns(uid);
    if (txns.length >= MAX_TXNS) return `A portfolio can hold up to ${MAX_TXNS} transactions.`;
    try {
      computeHoldings([...txns, t]);
    } catch (err) {
      if (err instanceof OversellError) return await oversellMessage(err);
      throw err;
    }
    await pool().query(
      `INSERT INTO portfolio_txns (user_id, asset_id, side, quantity, price, fee, executed_at, note)
       VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), $8)`,
      [uid, t.assetId, t.side, t.quantity, t.price, t.fee, t.executedAt, t.note || null],
    );
  });
}

export async function deleteTxn(id: string): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    const txns = await getTxns(uid);
    const rest = txns.filter((t) => t.id !== id);
    try {
      computeHoldings(rest);
    } catch (err) {
      if (err instanceof OversellError) {
        return "Removing this buy would leave a later sell with nothing to sell. Remove the sell first.";
      }
      throw err;
    }
    await pool().query(`DELETE FROM portfolio_txns WHERE id = $1 AND user_id = $2`, [id, uid]);
  });
}

export async function createAlert(input: {
  assetId: string;
  direction: AlertDirection;
  target: number;
  notifyEmail: boolean;
}): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    if (input.direction !== "above" && input.direction !== "below") return "Choose above or below.";
    if (!(Number.isFinite(input.target) && input.target > 0)) return "Enter a target price above zero.";
    const [asset] = await getAssetRows([input.assetId]);
    if (!asset) return "Pick a coin from the list.";
    const price = asset.live?.p ?? asset.refPrice;
    if (price != null && alertHit(input.direction, input.target, price)) {
      return `${asset.symbol} is already ${input.direction} ${formatUsd(input.target)} (now ${formatUsd(price)}).`;
    }
    const res = await pool().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM price_alerts WHERE user_id = $1 AND triggered_at IS NULL`,
      [uid],
    );
    if ((res.rows[0]?.n ?? 0) >= MAX_ALERTS_PER_USER) return `You can have up to ${MAX_ALERTS_PER_USER} alerts waiting.`;
    await pool().query(
      `INSERT INTO price_alerts (user_id, asset_id, direction, target, notify_email) VALUES ($1, $2, $3, $4, $5)`,
      [uid, input.assetId, input.direction, input.target, Boolean(input.notifyEmail)],
    );
  });
}

export async function deleteAlert(id: string): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    await pool().query(`DELETE FROM price_alerts WHERE id = $1 AND user_id = $2`, [id, uid]);
  });
}

export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
}): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    let url: URL;
    try {
      url = new URL(sub.endpoint);
    } catch {
      return "That browser gave an invalid notification address.";
    }
    if (url.protocol !== "https:" || !sub.keys?.p256dh || !sub.keys?.auth) return "This browser can't receive notifications.";
    await pool().query(
      `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [sub.endpoint, uid, sub.keys.p256dh, sub.keys.auth, sub.userAgent.slice(0, 300)],
    );
  });
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    await pool().query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, uid]);
  });
}

export async function sendTestPush(): Promise<ActionResult> {
  return attempt(async () => {
    const uid = await userId();
    const sent = await pushToUser(uid, {
      title: "midbig notifications work",
      body: "Price alerts will show up like this.",
      url: "/alerts",
      tag: "test",
    });
    if (sent === 0) return "No device has notifications turned on yet.";
  });
}
