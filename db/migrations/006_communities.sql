-- Phase 6: communities (b/ for main assets, m/ for smaller coins and
-- member-made ones), up and down votes, nested comments, verified members,
-- bots, site switches and the admin log.

-- Verified members can create m/ communities. Set by an admin for now.
ALTER TABLE "user" ADD COLUMN verified boolean NOT NULL DEFAULT false;
--;;
-- Bot accounts post like members, under their own badge. They never log in.
ALTER TABLE "user" ADD COLUMN is_bot boolean NOT NULL DEFAULT false;
--;;
-- Switches the admin portal changes, e.g. which asset classes are on.
CREATE TABLE site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES "user" ("id") ON DELETE SET NULL
);
--;;
INSERT INTO site_settings (key, value) VALUES ('categories', '{"crypto": true, "stock": true, "forex": true}');
--;;
-- One name per community across both namespaces (b/bitcoin and m/bitcoin
-- can't both exist), compared in lower case.
--   kind 'asset': a listed coin, stock or forex pair (asset_id set)
--   kind 'hub':   a topic area such as b/general, set up by admins
--   kind 'token': an unlisted coin someone added in m/ (token_info has its chain and contract)
CREATE TABLE communities (
  id           bigserial PRIMARY KEY,
  ns           text NOT NULL CHECK (ns IN ('b', 'm')),
  slug         text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,49}$'),
  kind         text NOT NULL CHECK (kind IN ('asset', 'hub', 'token')),
  asset_id     text REFERENCES assets (id) ON DELETE SET NULL,
  -- Which category switch hides it; NULL for hubs that belong to none (b/general).
  asset_class  text CHECK (asset_class IN ('crypto', 'stock', 'forex')),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  symbol       text CHECK (char_length(symbol) <= 20),
  description  text CHECK (char_length(description) <= 500),
  rules        text CHECK (char_length(rules) <= 2000),
  token_info   jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_by   text REFERENCES "user" ("id") ON DELETE SET NULL,
  member_count integer NOT NULL DEFAULT 0,
  topic_count  integer NOT NULL DEFAULT 0,
  last_post_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE UNIQUE INDEX communities_slug_idx ON communities (slug);
--;;
CREATE UNIQUE INDEX communities_asset_idx ON communities (asset_id) WHERE asset_id IS NOT NULL;
--;;
CREATE INDEX communities_active_idx ON communities (ns, member_count DESC) WHERE status = 'active';
--;;
-- role 'mod': a community moderator, picked by an admin.
CREATE TABLE community_members (
  community_id bigint NOT NULL REFERENCES communities (id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'mod')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
--;;
CREATE INDEX community_members_user_idx ON community_members (user_id);
--;;
-- Hubs that take over the Phase 5 forum categories.
INSERT INTO communities (ns, slug, kind, asset_class, title, description) VALUES
  ('b', 'general', 'hub', NULL, 'General', 'Markets, news and anything that doesn''t fit a single asset.'),
  ('b', 'crypto', 'hub', 'crypto', 'Crypto', 'Coins, tokens, exchanges and on-chain talk.'),
  ('b', 'stocks', 'hub', 'stock', 'Stocks', 'US stocks, earnings and the economy.'),
  ('b', 'forex', 'hub', 'forex', 'Forex', 'Currencies, central banks and rates.'),
  ('b', 'strategy', 'hub', NULL, 'Strategies and risk', 'How you size positions, hedge and survive drawdowns. Share your reasoning, not signals.'),
  ('b', 'midbig', 'hub', NULL, 'Site feedback', 'Bugs, ideas and requests for midbig itself.');
--;;
-- Assets people already wrote about get their b/ community now, so their
-- topics keep their home. Admins add the rest from the admin portal.
INSERT INTO communities (ns, slug, kind, asset_id, asset_class, title, symbol)
SELECT 'b', s.slug, 'asset', a.id, a.asset_class, a.name,
       CASE WHEN a.asset_class = 'forex' THEN upper(replace(substr(a.id, 4), '-', '/')) ELSE upper(a.symbol) END
FROM assets a
CROSS JOIN LATERAL (SELECT CASE a.asset_class
    WHEN 'stock' THEN replace(substr(a.id, 7), '-', '')
    WHEN 'forex' THEN replace(substr(a.id, 4), '-', '')
    ELSE a.id END AS slug) s
WHERE a.id IN (SELECT DISTINCT asset_id FROM forum_topics WHERE asset_id IS NOT NULL)
  AND s.slug ~ '^[a-z0-9][a-z0-9-]{1,49}$'
ON CONFLICT DO NOTHING;
--;;
ALTER TABLE forum_topics ADD COLUMN community_id bigint REFERENCES communities (id) ON DELETE CASCADE;
--;;
UPDATE forum_topics t SET community_id = COALESCE(
  (SELECT c.id FROM communities c WHERE c.asset_id = t.asset_id),
  (SELECT c.id FROM communities c WHERE c.slug = CASE t.category
     WHEN 'feedback' THEN 'midbig' WHEN 'crypto' THEN 'crypto' WHEN 'stocks' THEN 'stocks'
     WHEN 'forex' THEN 'forex' WHEN 'strategy' THEN 'strategy' ELSE 'general' END));
--;;
ALTER TABLE forum_topics ALTER COLUMN community_id SET NOT NULL;
--;;
ALTER TABLE forum_topics DROP COLUMN category;
--;;
-- The opening post's net votes, and the "hot" rank built from them and the
-- topic's age (hotRank() in packages/shared/src/community.ts).
ALTER TABLE forum_topics ADD COLUMN score integer NOT NULL DEFAULT 0;
--;;
ALTER TABLE forum_topics ADD COLUMN hot float8 NOT NULL DEFAULT 0;
--;;
-- The author's call when posting: bullish or bearish. Feeds the sentiment gauge.
ALTER TABLE forum_topics ADD COLUMN stance text CHECK (stance IN ('bull', 'bear'));
--;;
CREATE INDEX forum_topics_community_hot_idx ON forum_topics (community_id, hot DESC) WHERE status = 'visible';
--;;
CREATE INDEX forum_topics_community_new_idx ON forum_topics (community_id, created_at DESC) WHERE status = 'visible';
--;;
CREATE INDEX forum_topics_hot_idx ON forum_topics (hot DESC) WHERE status = 'visible';
--;;
CREATE INDEX forum_topics_new_idx ON forum_topics (created_at DESC) WHERE status = 'visible';
--;;
-- Comments nest: parent_id is the comment answered (NULL for a top-level one).
ALTER TABLE forum_posts ADD COLUMN parent_id bigint REFERENCES forum_posts (id) ON DELETE CASCADE;
--;;
ALTER TABLE forum_posts ADD COLUMN depth smallint NOT NULL DEFAULT 0;
--;;
ALTER TABLE forum_posts RENAME COLUMN helpful_count TO score;
--;;
ALTER TABLE forum_posts ADD COLUMN ups integer NOT NULL DEFAULT 0;
--;;
ALTER TABLE forum_posts ADD COLUMN downs integer NOT NULL DEFAULT 0;
--;;
UPDATE forum_posts SET ups = score;
--;;
-- Phase 5 "helpful" votes become upvotes.
ALTER TABLE forum_votes ADD COLUMN value smallint NOT NULL DEFAULT 1 CHECK (value IN (-1, 1));
--;;
UPDATE forum_topics t SET score = COALESCE((SELECT p.score FROM forum_posts p WHERE p.topic_id = t.id AND p.is_first), 0);
--;;
UPDATE forum_topics SET hot = sign(score) * log(greatest(abs(score), 1)) + (extract(epoch FROM created_at) - 1767225600) / 45000;
--;;
-- Whoever started a topic somewhere joins that community, so feeds aren't empty on day one.
INSERT INTO community_members (community_id, user_id)
SELECT DISTINCT t.community_id, t.user_id FROM forum_topics t
ON CONFLICT DO NOTHING;
--;;
UPDATE communities c SET
  member_count = (SELECT count(*) FROM community_members m WHERE m.community_id = c.id),
  topic_count = (SELECT count(*) FROM forum_topics t WHERE t.community_id = c.id AND t.status = 'visible'),
  last_post_at = (SELECT max(t.last_post_at) FROM forum_topics t WHERE t.community_id = c.id AND t.status = 'visible');
--;;
-- Bots: each is a user row (is_bot) so its replies are ordinary posts and
-- chat messages. kind picks what it answers with; 'ai' needs ANTHROPIC_API_KEY.
CREATE TABLE bots (
  user_id     text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  handle      text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('price', 'risk', 'pulse', 'ai')),
  description text NOT NULL CHECK (char_length(description) <= 200),
  -- Extra instructions for an AI bot's voice and focus.
  persona     text CHECK (char_length(persona) <= 1000),
  enabled     boolean NOT NULL DEFAULT true,
  daily_cap   integer NOT NULL DEFAULT 200 CHECK (daily_cap BETWEEN 0 AND 100000),
  created_by  text REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE UNIQUE INDEX bots_handle_idx ON bots (lower(handle));
--;;
-- One answer per bot per message, and the record the daily caps count.
CREATE TABLE bot_replies (
  id         bigserial PRIMARY KEY,
  bot_id     text NOT NULL REFERENCES bots (user_id) ON DELETE CASCADE,
  source     text NOT NULL CHECK (source IN ('post', 'chat')),
  source_id  bigint NOT NULL,
  asker_id   text REFERENCES "user" ("id") ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, source, source_id)
);
--;;
CREATE INDEX bot_replies_day_idx ON bot_replies (bot_id, created_at DESC);
--;;
INSERT INTO "user" (id, name, email, "emailVerified", chat_name, is_bot, bio) VALUES
  ('bot-pricebot', 'pricebot', 'pricebot@bots.midbig.invalid', true, 'pricebot', true, 'Answers with the latest price, change and key figures.'),
  ('bot-riskbot', 'riskbot', 'riskbot@bots.midbig.invalid', true, 'riskbot', true, 'Answers with volatility, drawdowns and worst days from the last year.'),
  ('bot-pulsebot', 'pulsebot', 'pulsebot@bots.midbig.invalid', true, 'pulsebot', true, 'Sums up what a community talked about in the last day.')
ON CONFLICT DO NOTHING;
--;;
INSERT INTO bots (user_id, handle, kind, description)
SELECT u.id, u.chat_name, k.kind, u.bio
FROM "user" u JOIN (VALUES ('bot-pricebot', 'price'), ('bot-riskbot', 'risk'), ('bot-pulsebot', 'pulse')) k(id, kind) ON k.id = u.id;
--;;
-- What admins and moderators changed, newest first in the admin portal.
CREATE TABLE admin_log (
  id         bigserial PRIMARY KEY,
  actor_id   text REFERENCES "user" ("id") ON DELETE SET NULL,
  action     text NOT NULL,
  target     text,
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE INDEX admin_log_created_idx ON admin_log (created_at DESC);
