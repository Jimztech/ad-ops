import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Campaign, DailyMetric, PlatformAdapter } from '@adpilot/shared';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module.js';
import { META_ADAPTER } from './sync.constants.js';

export type SyncResult = {
  runId: number;
  campaigns: number;
  metricRows: number;
  skippedRows: number;
  durationMs: number;
};

const CHUNK_SIZE = 5000;
const isoDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(META_ADAPTER) private readonly adapter: PlatformAdapter,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async run(): Promise<SyncResult> {
    const startedAt = Date.now();

    // Record the run first, so even a crash leaves a trace.
    const started = await this.pool.query<{ id: number }>(
      `INSERT INTO sync_runs (channel, status) VALUES ($1, 'running') RETURNING id`,
      [this.adapter.channel],
    );
    const runId = started.rows[0].id;

    try {
      const lookback = Number(this.config.get('SYNC_LOOKBACK_DAYS') ?? 30);

      // 1) Fetch everything BEFORE opening a database transaction. Network calls are slow,
      //    and we don't want to hold database locks while waiting on them.
      const campaigns = await this.adapter.fetchCampaigns();
      const metrics = await this.adapter.fetchDailyMetrics(isoDay(lookback), isoDay(1));

      // 2) Write everything in one transaction: all of it lands, or none of it does.
      const written = await this.write(campaigns, metrics);

      await this.pool.query(
        `UPDATE sync_runs SET status = 'success', finished_at = now(), rows_upserted = $2 WHERE id = $1`,
        [runId, written.campaigns + written.metricRows],
      );

      if (written.skippedRows > 0) {
        this.logger.warn(`Skipped ${written.skippedRows} metric rows for campaigns not returned by the API`);
      }
      return { runId, ...written, durationMs: Date.now() - startedAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.pool.query(
        `UPDATE sync_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
        [runId, message],
      );
      this.logger.error(`Sync run ${runId} failed: ${message}`);
      throw err;
    }
  }

  async recentRuns() {
    const { rows } = await this.pool.query(
      `SELECT id, channel, status, started_at, finished_at, rows_upserted, error
         FROM sync_runs ORDER BY id DESC LIMIT 10`,
    );
    return rows;
  }

  // ---- database writes ----

  private async write(campaigns: Campaign[], metrics: DailyMetric[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const accountId = await this.upsertAccount(client);
      const idByExternalId = await this.upsertCampaigns(client, accountId, campaigns);
      const { written, skipped } = await this.upsertMetrics(client, idByExternalId, metrics);
      await client.query('COMMIT');
      return { campaigns: campaigns.length, metricRows: written, skippedRows: skipped };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async upsertAccount(client: PoolClient): Promise<number> {
    const externalId = this.config.getOrThrow<string>('META_AD_ACCOUNT_ID');
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO ad_accounts (channel, external_id, name, currency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (channel, external_id)
       DO UPDATE SET name = EXCLUDED.name, currency = EXCLUDED.currency
       RETURNING id`,
      [
        this.adapter.channel,
        externalId,
        this.config.get<string>('META_ACCOUNT_NAME') ?? externalId,
        this.config.get<string>('META_ACCOUNT_CURRENCY') ?? 'USD',
      ],
    );
    return rows[0].id;
  }

  private async upsertCampaigns(
    client: PoolClient,
    accountId: number,
    campaigns: Campaign[],
  ): Promise<Map<string, number>> {
    const idByExternalId = new Map<string, number>();
    if (campaigns.length === 0) return idByExternalId;

    // unnest() turns arrays into rows, so ONE query inserts every campaign.
    const { rows } = await client.query<{ id: number; external_id: string }>(
      `INSERT INTO campaigns (account_id, external_id, name, status, objective, daily_budget, updated_at)
       SELECT $1::int, u.external_id, u.name, u.status, u.objective, u.daily_budget, now()
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[])
              AS u(external_id, name, status, objective, daily_budget)
       ON CONFLICT (account_id, external_id)
       DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status,
                     objective = EXCLUDED.objective, daily_budget = EXCLUDED.daily_budget,
                     updated_at = now()
       RETURNING id, external_id`,
      [
        accountId,
        campaigns.map((c) => c.externalId),
        campaigns.map((c) => c.name),
        campaigns.map((c) => c.status),
        campaigns.map((c) => c.objective),
        campaigns.map((c) => c.dailyBudget),
      ],
    );
    for (const r of rows) idByExternalId.set(r.external_id, r.id);
    return idByExternalId;
  }

  private async upsertMetrics(
    client: PoolClient,
    idByExternalId: Map<string, number>,
    metrics: DailyMetric[],
  ) {
    // Metric rows carry Meta's campaign id; the database needs OUR campaign id.
    const known = metrics.filter((m) => idByExternalId.has(m.campaignExternalId));
    const skipped = metrics.length - known.length;

    for (let i = 0; i < known.length; i += CHUNK_SIZE) {
      const chunk = known.slice(i, i + CHUNK_SIZE);
      await client.query(
        `INSERT INTO daily_metrics
           (campaign_id, date, publisher_platform, spend, impressions, clicks, conversions, revenue)
         SELECT * FROM unnest($1::int[], $2::date[], $3::text[], $4::numeric[],
                              $5::bigint[], $6::bigint[], $7::numeric[], $8::numeric[])
         ON CONFLICT (campaign_id, date, publisher_platform)
         DO UPDATE SET spend = EXCLUDED.spend, impressions = EXCLUDED.impressions,
                       clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions,
                       revenue = EXCLUDED.revenue`,
        [
          chunk.map((m) => idByExternalId.get(m.campaignExternalId)),
          chunk.map((m) => m.date),
          chunk.map((m) => m.publisherPlatform),
          chunk.map((m) => m.spend),
          chunk.map((m) => m.impressions),
          chunk.map((m) => m.clicks),
          chunk.map((m) => m.conversions),
          chunk.map((m) => m.revenue),
        ],
      );
    }
    return { written: known.length, skipped };
  }
}