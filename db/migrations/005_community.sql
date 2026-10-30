-- Phase 5: forum topics and posts, "helpful" votes, post reports, and the
-- reputation and bio shown on public profiles.

-- Earned from helpful votes, minus removed posts (see reputation() in
-- packages/shared/src/forum.ts). Kept here so lists can sort by it.
ALTER TABLE "user" ADD COLUMN reputation integer NOT NULL DEFAULT 0;
--;;
ALTER TABLE "user" ADD COLUMN bio text CHECK (char_length(bio) <= 160);
--;;
CREATE INDEX user_reputation_idx ON "user" (reputation DESC) WHERE reputation > 0;
--;;
-- status follows the opening post: a held or removed opening post hides the topic.
CREATE TABLE forum_topics (
  id           bigserial PRIMARY KEY,
  category     text NOT NULL,
  asset_id     text REFERENCES assets (id) ON DELETE SET NULL,
  user_id      text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 8 AND 120),
  status       text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'held', 'removed')),
  pinned       boolean NOT NULL DEFAULT false,
  locked       boolean NOT NULL DEFAULT false,
  -- Visible replies, and when the newest one (or the topic) was posted.
  reply_count  integer NOT NULL DEFAULT 0,
  last_post_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE INDEX forum_topics_latest_idx ON forum_topics (last_post_at DESC) WHERE status = 'visible';
--;;
CREATE INDEX forum_topics_category_idx ON forum_topics (category, pinned DESC, last_post_at DESC) WHERE status = 'visible';
--;;
CREATE INDEX forum_topics_asset_idx ON forum_topics (asset_id, last_post_at DESC) WHERE status = 'visible' AND asset_id IS NOT NULL;
--;;
CREATE INDEX forum_topics_user_idx ON forum_topics (user_id, created_at DESC);
--;;
-- The opening post (is_first) and every reply. Held and removed work as in chat.
CREATE TABLE forum_posts (
  id            bigserial PRIMARY KEY,
  topic_id      bigint NOT NULL REFERENCES forum_topics (id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  is_first      boolean NOT NULL DEFAULT false,
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  status        text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'held', 'removed')),
  held_by       text CHECK (held_by IN ('filter', 'reports')),
  flags         text[] NOT NULL DEFAULT '{}',
  report_count  integer NOT NULL DEFAULT 0,
  helpful_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  edited_at     timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   text REFERENCES "user" ("id") ON DELETE SET NULL
);
--;;
CREATE INDEX forum_posts_topic_idx ON forum_posts (topic_id, id);
--;;
CREATE INDEX forum_posts_user_idx ON forum_posts (user_id, created_at DESC);
--;;
CREATE INDEX forum_posts_queue_idx ON forum_posts (id)
  WHERE status = 'held' OR (status = 'visible' AND report_count > 0 AND reviewed_at IS NULL);
--;;
CREATE TABLE forum_votes (
  post_id    bigint NOT NULL REFERENCES forum_posts (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
--;;
CREATE INDEX forum_votes_user_idx ON forum_votes (user_id);
--;;
CREATE TABLE forum_reports (
  post_id     bigint NOT NULL REFERENCES forum_posts (id) ON DELETE CASCADE,
  reporter_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('scam', 'spam', 'abuse', 'other')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, reporter_id)
);
