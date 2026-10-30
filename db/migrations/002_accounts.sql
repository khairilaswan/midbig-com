-- Phase 2: user accounts (Better Auth tables), watchlist, portfolio
-- transactions, price alerts and web push subscriptions.

-- Better Auth's tables, as its migration tool generates them for 1.7.
CREATE TABLE "user" (
  "id"            text PRIMARY KEY,
  "name"          text NOT NULL,
  "email"         text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image"         text,
  "createdAt"     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--;;
CREATE TABLE "session" (
  "id"        text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token"     text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
--;;
CREATE TABLE "account" (
  "id"                    text PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             timestamptz NOT NULL
);
--;;
CREATE TABLE "verification" (
  "id"         text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--;;
CREATE INDEX "session_userId_idx" ON "session" ("userId");
--;;
CREATE INDEX "account_userId_idx" ON "account" ("userId");
--;;
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
--;;
CREATE TABLE watchlist (
  user_id  text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset_id)
);
--;;
-- Buys and sells. Holdings, average cost and profit are computed from these.
CREATE TABLE portfolio_txns (
  id          bigserial PRIMARY KEY,
  user_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  asset_id    text NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  side        text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity    double precision NOT NULL CHECK (quantity > 0),
  price       double precision NOT NULL CHECK (price >= 0),
  fee         double precision NOT NULL DEFAULT 0 CHECK (fee >= 0),
  executed_at timestamptz NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE INDEX portfolio_txns_user_idx ON portfolio_txns (user_id, executed_at);
--;;
-- One-shot alerts: triggered_at is set when the price crosses the target.
CREATE TABLE price_alerts (
  id              bigserial PRIMARY KEY,
  user_id         text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  asset_id        text NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('above', 'below')),
  target          double precision NOT NULL CHECK (target > 0),
  notify_email    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  triggered_at    timestamptz,
  triggered_price double precision
);
--;;
CREATE INDEX price_alerts_user_idx ON price_alerts (user_id, created_at DESC);
--;;
CREATE INDEX price_alerts_waiting_idx ON price_alerts (asset_id) WHERE triggered_at IS NULL;
--;;
-- Browser push subscriptions, one per device that turned notifications on.
CREATE TABLE push_subscriptions (
  endpoint   text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
--;;
-- Generated keys the services share, such as the web push (VAPID) key pair.
CREATE TABLE app_secrets (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
