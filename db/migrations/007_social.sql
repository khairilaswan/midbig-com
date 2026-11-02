-- Phase 7: photos (profile, banner, in posts), the look (theme and
-- template), follows, notifications, saved topics, reactions, flair, polls
-- and view counts.

-- Uploaded photos. Kept in Postgres so the nightly database backup covers
-- them; the browser shrinks each one first, so most are 50-400 KB.
-- id is random (22 URL-safe characters), so photo URLs can't be guessed.
CREATE TABLE media (
  id         text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{22}$'),
  user_id    text REFERENCES "user" ("id") ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('post', 'avatar', 'banner')),
  mime       text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  bytes      bytea NOT NULL,
  size       integer NOT NULL,
  width      integer,
  height     integer,
  -- removed: taken down by a moderator, or its post was removed. Served as 404.
  status     text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE INDEX media_user_idx ON media (user_id, created_at DESC);
--;;
ALTER TABLE "user" ADD COLUMN avatar_id text REFERENCES media (id) ON DELETE SET NULL;
--;;
ALTER TABLE "user" ADD COLUMN banner_id text REFERENCES media (id) ON DELETE SET NULL;
--;;
-- The member's own look, e.g. {"style": "glass", "color": "red", "mode": "auto", "template": "hub"}.
-- Empty means the site default (site_settings 'look').
ALTER TABLE "user" ADD COLUMN look jsonb NOT NULL DEFAULT '{}';
--;;
INSERT INTO site_settings (key, value) VALUES ('look', '{"style": "classic", "color": "blue", "mode": "auto", "template": "markets"}')
ON CONFLICT DO NOTHING;
--;;
-- Up to four photos on a post or comment, in order.
ALTER TABLE forum_posts ADD COLUMN images text[] NOT NULL DEFAULT '{}' CHECK (cardinality(images) <= 4);
--;;
ALTER TABLE forum_topics ADD COLUMN flair text CHECK (flair IN ('analysis', 'news', 'question', 'discussion', 'chart', 'earnings', 'meme', 'gain', 'loss'));
--;;
ALTER TABLE forum_topics ADD COLUMN views integer NOT NULL DEFAULT 0;
--;;
-- The opening post's first photo, for feed thumbnails.
ALTER TABLE forum_topics ADD COLUMN cover_id text REFERENCES media (id) ON DELETE SET NULL;
--;;
CREATE INDEX forum_topics_flair_idx ON forum_topics (community_id, flair, created_at DESC) WHERE status = 'visible' AND flair IS NOT NULL;
--;;
-- Following a member puts their topics in your Following feed.
CREATE TABLE follows (
  follower_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  followee_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
--;;
CREATE INDEX follows_followee_idx ON follows (followee_id);
--;;
-- The bell: replies to your posts, @mentions, new followers and vote milestones.
CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('reply', 'mention', 'follow', 'milestone')),
  actor_id   text REFERENCES "user" ("id") ON DELETE CASCADE,
  post_id    bigint REFERENCES forum_posts (id) ON DELETE CASCADE,
  detail     jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE INDEX notifications_user_idx ON notifications (user_id, id DESC);
--;;
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
--;;
-- One notification per kind, post and actor, so edits and re-votes don't repeat it.
CREATE UNIQUE INDEX notifications_once_idx ON notifications (user_id, kind, COALESCE(post_id, 0), COALESCE(actor_id, ''), COALESCE(detail->>'n', ''));
--;;
CREATE TABLE saved_topics (
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  topic_id   bigint NOT NULL REFERENCES forum_topics (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);
--;;
-- Emoji reactions, one of each kind per member per post.
CREATE TABLE post_reactions (
  post_id    bigint NOT NULL REFERENCES forum_posts (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (emoji IN ('rocket', 'fire', 'laugh', 'eyes', 'diamond', 'bear')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);
--;;
CREATE TABLE polls (
  topic_id   bigint PRIMARY KEY REFERENCES forum_topics (id) ON DELETE CASCADE,
  options    text[] NOT NULL CHECK (cardinality(options) BETWEEN 2 AND 6),
  closes_at  timestamptz NOT NULL
);
--;;
CREATE TABLE poll_votes (
  topic_id   bigint NOT NULL REFERENCES polls (topic_id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  choice     smallint NOT NULL CHECK (choice BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, user_id)
);
