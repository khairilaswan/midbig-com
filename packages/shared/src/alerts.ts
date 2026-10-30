/** Price alerts and the email/push helpers both apps use. */

export type AlertDirection = "above" | "below";

/** Most alerts waiting at once per user. */
export const MAX_ALERTS_PER_USER = 50;

export function alertHit(direction: AlertDirection, target: number, price: number): boolean {
  return direction === "above" ? price >= target : price <= target;
}

/** What the service worker shows for a push message. */
export interface PushPayload {
  title: string;
  body: string;
  /** Page to open when the notification is clicked. */
  url: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

/** Name of the app_secrets rows holding the web push key pair. */
export const VAPID_PUBLIC = "vapid_public_key";
export const VAPID_PRIVATE = "vapid_private_key";

/**
 * Sends an email through Resend's HTTP API (https://resend.com, free for
 * 3,000 a month). Returns false when no API key is set, so callers can fall
 * back to logging.
 */
export async function sendEmail(opts: {
  apiKey: string | undefined;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!opts.apiKey) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, text: opts.text }),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status} ${await res.text()}`);
  return true;
}
