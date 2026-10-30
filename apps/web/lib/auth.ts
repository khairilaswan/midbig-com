import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { sendEmail } from "@midbig/shared";
import { pool } from "./server";
import { SITE_NAME, SITE_URL } from "./site";

const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITE_URL);

/**
 * The secret signs session cookies. Set BETTER_AUTH_SECRET for a real launch.
 * On a home computer it falls back to one derived from the database
 * password, so there is one setting fewer to get wrong.
 */
function secret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const db = process.env.DATABASE_URL ?? "build";
  return createHash("sha256").update(`midbig-auth:${db}`).digest("hex");
}

export const emailEnabled = Boolean(process.env.RESEND_API_KEY);
export const EMAIL_FROM = process.env.EMAIL_FROM || `${SITE_NAME} <alerts@midbig.com>`;

/** Sends an email, or prints it to the log when no email service is set up. */
export async function mail(to: string, subject: string, text: string): Promise<void> {
  const sent = await sendEmail({ apiKey: process.env.RESEND_API_KEY, from: EMAIL_FROM, to, subject, text });
  if (!sent) console.log(`[email not configured] to=${to} subject="${subject}"\n${text}`);
}

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : undefined;
export const googleEnabled = Boolean(google);

const options = {
  appName: SITE_NAME,
  database: pool(),
  secret: secret(),
  // At home the site is reached at localhost and through Cloudflare quick
  // tunnels, so accept both. A launched site only trusts its own address.
  baseURL: local
    ? { allowedHosts: [new URL(SITE_URL).host, "*.trycloudflare.com"], protocol: "auto", fallback: SITE_URL }
    : SITE_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await mail(
        user.email,
        `Reset your ${SITE_NAME} password`,
        `Someone asked to reset the password for your ${SITE_NAME} account.\n\nTo choose a new password, open this link within an hour:\n${url}\n\nIf it wasn't you, ignore this email.`,
      );
    },
  },
  socialProviders: google ? { google } : undefined,
  user: { deleteUser: { enabled: true } },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    // Saves a database read on most requests; a sign-out elsewhere takes up to 5 minutes to apply.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  // db/migrations owns the schema. Better Auth's own check would also cache a
  // "missing tables" result if the site starts before the price service has
  // applied the migrations, and fail every login until a restart.
  advanced: { database: { validateSchema: false } },
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);

export type Session = typeof auth.$Infer.Session;

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** For signed-in pages: the session, or a redirect to the login page. */
export async function requireSession(next: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  return session;
}
