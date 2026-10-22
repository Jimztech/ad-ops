CREATE TABLE ad_accounts (
  id            SERIAL PRIMARY KEY,
  channel       TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL,
  timezone      TEXT,
  UNIQUE (channel, external_id)
);

CREATE TABLE campaigns (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES ad_accounts(id),
  external_id   TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL,
  objective     TEXT,
  daily_budget  NUMERIC(12, 2),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id)
);

CREATE TABLE daily_metrics (
  campaign_id         INTEGER NOT NULL REFERENCES campaigns(id),
  date                DATE NOT NULL,
  publisher_platform  TEXT NOT NULL,
  spend               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions         BIGINT NOT NULL DEFAULT 0,
  clicks              BIGINT NOT NULL DEFAULT 0,
  conversions         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  revenue             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, date, publisher_platform)
);

CREATE INDEX idx_daily_metrics_date ON daily_metrics (date);

CREATE TABLE sync_runs (
  id             SERIAL PRIMARY KEY,
  channel        TEXT NOT NULL,
  status         TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  rows_upserted  INTEGER NOT NULL DEFAULT 0,
  error          TEXT
);