-- Phase 4: US stocks and forex pairs share the assets table with crypto
-- (asset_class 'stock' or 'forex'). Ids are "stock-aapl" and "fx-eur-usd".

-- Exchange or market the asset trades on, e.g. "NASDAQ NMS - GLOBAL MARKET".
ALTER TABLE assets ADD COLUMN exchange text;
--;;
-- Industry for stocks (e.g. "Information Technology").
ALTER TABLE assets ADD COLUMN sector text;
--;;
-- Figures that only some classes have, as the provider reports them:
-- stocks: pe, beta, dividend_yield, week52_high, week52_low, prev_close,
-- day_open, day_high, day_low, shares_outstanding, website.
ALTER TABLE assets ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
--;;
-- When the quote (price, previous close) was last refreshed, separately from
-- the slower profile data.
ALTER TABLE assets ADD COLUMN quote_updated_at timestamptz;
