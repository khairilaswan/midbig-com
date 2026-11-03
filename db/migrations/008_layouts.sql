-- Block layouts people can arrange by drag and drop: a member's own home
-- page (one per template) and a community's page, set by its creator.
ALTER TABLE "user" ADD COLUMN home_layouts jsonb NOT NULL DEFAULT '{}';
--;;
ALTER TABLE communities ADD COLUMN layout jsonb;
--;;
INSERT INTO site_settings (key, value) VALUES ('layout_editing', '{"members": true, "communities": true}')
ON CONFLICT (key) DO NOTHING;
