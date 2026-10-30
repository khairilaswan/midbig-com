-- midbig.com initial schema: assets, 1-minute candles and their rollups.
-- Statements are separated by "--;;" lines because TimescaleDB continuous
-- aggregates can't be created inside a transaction block.

CREATE EXTENSION IF NOT EXISTS timescaledb;
--;;
-- One row per tradable asset. id is the URL slug; for crypto it is the
-- CoinGecko id. asset_class leaves room for forex and stocks in Phase 4.
CREATE TABLE assets (
  id                      text PRIMARY KEY,
  asset_class             text NOT NULL DEFAULT 'crypto',
  symbol                  text NOT NULL,
  name                    text NOT NULL,
  image_url               text,
  market_cap_rank         integer,
  market_cap              double precision,
  fully_diluted_valuation double precision,
  total_volume            double precision,
  circulating_supply      double precision,
  total_supply            double precision,
  max_supply              double precision,
  ath                     double precision,
  ath_date                timestamptz,
  atl                     double precision,
  atl_date                timestamptz,
  -- Price and changes as last reported by the metadata provider. Used as the
  -- fallback price when no exchange feed quotes the asset, and to derive the
  -- 24h/7d reference prices that live prices are compared against.
  ref_price               double precision,
  price_change_pct_24h    double precision,
  price_change_pct_7d     double precision,
  sparkline_7d            real[],
  metadata_updated_at     timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);
--;;
CREATE INDEX assets_class_rank_idx ON assets (asset_class, market_cap_rank);
--;;
CREATE INDEX assets_symbol_idx ON assets (lower(symbol));
--;;
-- 1-minute OHLCV candles built from exchange trades. This is the price
-- history the site keeps from day one.
CREATE TABLE candles_1m (
  asset_id text             NOT NULL,
  ts       timestamptz      NOT NULL,
  open     double precision NOT NULL,
  high     double precision NOT NULL,
  low      double precision NOT NULL,
  close    double precision NOT NULL,
  volume   double precision NOT NULL DEFAULT 0,
  trades   integer          NOT NULL DEFAULT 0,
  PRIMARY KEY (asset_id, ts)
);
--;;
SELECT create_hypertable('candles_1m', by_range('ts', INTERVAL '7 days'));
--;;
ALTER TABLE candles_1m SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'asset_id',
  timescaledb.compress_orderby = 'ts DESC'
);
--;;
SELECT add_compression_policy('candles_1m', INTERVAL '14 days');
--;;
CREATE MATERIALIZED VIEW candles_1h
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT asset_id,
       time_bucket(INTERVAL '1 hour', ts) AS ts,
       first(open, ts) AS open,
       max(high)       AS high,
       min(low)        AS low,
       last(close, ts) AS close,
       sum(volume)     AS volume
FROM candles_1m
GROUP BY asset_id, time_bucket(INTERVAL '1 hour', ts)
WITH NO DATA;
--;;
SELECT add_continuous_aggregate_policy('candles_1h',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes');
--;;
CREATE MATERIALIZED VIEW candles_1d
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT asset_id,
       time_bucket(INTERVAL '1 day', ts) AS ts,
       first(open, ts) AS open,
       max(high)       AS high,
       min(low)        AS low,
       last(close, ts) AS close,
       sum(volume)     AS volume
FROM candles_1h
GROUP BY asset_id, time_bucket(INTERVAL '1 day', ts)
WITH NO DATA;
--;;
SELECT add_continuous_aggregate_policy('candles_1d',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');
--;;
-- Daily closes backfilled from the metadata provider, so charts have a year
-- of history before our own candles accumulate.
CREATE TABLE history_daily (
  asset_id   text             NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  day        date             NOT NULL,
  close      double precision NOT NULL,
  volume     double precision,
  market_cap double precision,
  PRIMARY KEY (asset_id, day)
);
