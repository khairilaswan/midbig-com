-- Phase 3: two-factor login, staff roles, chat names, chat rooms,
-- reports, mutes and bans.

-- Better Auth's two-factor plugin, as its migration tool generates it for 1.7.
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" boolean DEFAULT false;
--;;
CREATE TABLE "twoFactor" (
  "id"                      text PRIMARY KEY,
  "secret"                  text NOT NULL,
  "backupCodes"             text NOT NULL,
  "userId"                  text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "verified"                boolean DEFAULT true,
  "failedVerificationCount" integer DEFAULT 0,
  "lockedUntil"             timestamptz
);
--;;
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor" ("secret");
--;;
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor" ("userId");
--;;
-- Staff: admins come from ADMIN_EMAILS; admins make moderators.
ALTER TABLE "user" ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin'));
--;;
-- Public name in chat, chosen before the first message so emails never show.
ALTER TABLE "user" ADD COLUMN chat_name text;
--;;
CREATE UNIQUE INDEX user_chat_name_idx ON "user" (lower(chat_name));
--;;
-- room is "global" or "coin:<asset id>". Held messages wait for a moderator:
-- only their author and moderators see them.
CREATE TABLE chat_messages (
  id           bigserial PRIMARY KEY,
  room         text NOT NULL,
  user_id      text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  status       text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'held', 'removed')),
  -- Why it was held: 'filter' (caught on the way in) or 'reports' (hidden by user reports).
  held_by      text CHECK (held_by IN ('filter', 'reports')),
  flags        text[] NOT NULL DEFAULT '{}',
  report_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Set when a moderator approves or removes it, or the author deletes it.
  reviewed_at  timestamptz,
  reviewed_by  text REFERENCES "user" ("id") ON DELETE SET NULL
);
--;;
CREATE INDEX chat_messages_room_idx ON chat_messages (room, id DESC) WHERE status = 'visible';
--;;
CREATE INDEX chat_messages_user_idx ON chat_messages (user_id, created_at DESC);
--;;
CREATE INDEX chat_messages_queue_idx ON chat_messages (id)
  WHERE status = 'held' OR (status = 'visible' AND report_count > 0 AND reviewed_at IS NULL);
--;;
CREATE TABLE chat_reports (
  message_id  bigint NOT NULL REFERENCES chat_messages (id) ON DELETE CASCADE,
  reporter_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('scam', 'spam', 'abuse', 'other')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reporter_id)
);
--;;
-- Personal mutes: hides one person's messages for the user who muted them.
CREATE TABLE chat_mutes (
  user_id       text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  muted_user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_user_id)
);
--;;
-- Chat bans set by moderators. until NULL means for good.
CREATE TABLE chat_bans (
  user_id    text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  until      timestamptz,
  reason     text,
  banned_by  text REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
