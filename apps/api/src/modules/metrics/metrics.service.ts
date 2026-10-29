import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MetricsQuery, MetricsResult, MetricsRow, MetricTotals } from '@adpilot/shared';
import type { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module.js';

const MAX_ROWS = 200;

// groupBy comes from the user, so it must NEVER be pasted into SQL directly.
// We map each allowed value to a fixed SQL fragment instead (an allow-list).
const GROUPS = {
  day: { key: `to_char(m.date, 'YYYY-MM-DD')`, label: `to_char(m.date, 'YYYY-MM-DD')`, order: 'group_key ASC' },
  campaign: { key: 'c.id::text', label: 'c.name', order: 'spend DESC' },
  platform: { key: 'm.publisher_platform', label: 'm.publisher_platform', order: 'spend DESC' },
} as const;

const money = (n: number) => Math.round(n * 100) / 100;
const ratio = (num: number, den: number, scale = 1, decimals = 4): number | null =>
  den > 0 ? Math.round((num / den) * scale * 10 ** decimals) / 10 ** decimals : null;

type Sums = Pick<MetricTotals, 'spend' | 'impressions' | 'clicks' | 'conversions' | 'revenue'>;

// Ratios are computed from the SUMMED counts, never averaged, so they are always correct.
function withRatios(s: Sums): MetricTotals {
  return {
    spend: money(s.spend),
    impressions: s.impressions,
    clicks: s.clicks,
    conversions: s.conversions,
    revenue: money(s.revenue),
    ctr: ratio(s.clicks, s.impressions, 1, 4),
    cpc: ratio(s.spend, s.clicks, 1, 2),
    cpm: ratio(s.spend, s.impressions, 1000, 2),
    cpa: ratio(s.spend, s.conversions, 1, 2),
    roas: ratio(s.revenue, s.spend, 1, 2),
  };
}

@Injectable()
export class MetricsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getMetrics(q: MetricsQuery): Promise<MetricsResult> {
    const account = await this.defaultAccount();
    const g = GROUPS[q.groupBy];

    const { rows } = await this.pool.query(
      `SELECT ${g.key} AS group_key, ${g.label} AS group_label,
              SUM(m.spend) AS spend, SUM(m.impressions) AS impressions, SUM(m.clicks) AS clicks,
              SUM(m.conversions) AS conversions, SUM(m.revenue) AS revenue
         FROM daily_metrics m
         JOIN campaigns c ON c.id = m.campaign_id
        WHERE c.account_id = $1
          AND m.date BETWEEN $2::date AND $3::date
          AND ($4::text IS NULL OR m.publisher_platform = $4)
          AND ($5::int IS NULL OR c.id = $5)
        GROUP BY 1, 2
        ORDER BY ${g.order}
        LIMIT ${MAX_ROWS + 1}`,
      [account.id, q.from, q.to, q.platform ?? null, q.campaignId ?? null],
    );

    const truncated = rows.length > MAX_ROWS;
    const result: MetricsRow[] = rows.slice(0, MAX_ROWS).map((r) => ({
      key: r.group_key,
      label: r.group_label,
      ...withRatios({
        spend: Number(r.spend),
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        conversions: Number(r.conversions),
        revenue: Number(r.revenue),
      }),
    }));

    const sums = result.reduce<Sums>(
      (t, r) => ({
        spend: t.spend + r.spend,
        impressions: t.impressions + r.impressions,
        clicks: t.clicks + r.clicks,
        conversions: t.conversions + r.conversions,
        revenue: t.revenue + r.revenue,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    );

    return {
      currency: account.currency,
      from: q.from,
      to: q.to,
      groupBy: q.groupBy,
      rows: result,
      totals: withRatios(sums),
      truncated,
    };
  }

  async listCampaigns() {
    const account = await this.defaultAccount();
    const { rows } = await this.pool.query(
      `SELECT id, external_id AS "externalId", name, status, objective,
              daily_budget::float8 AS "dailyBudget"
         FROM campaigns WHERE account_id = $1 ORDER BY name`,
      [account.id],
    );
    return rows;
  }

  // Every query is scoped to an account. With one test account we just pick the first;
  // multi-account support later means replacing this ONE method.
  private async defaultAccount(): Promise<{ id: number; currency: string }> {
    const { rows } = await this.pool.query<{ id: number; currency: string }>(
      `SELECT id, currency FROM ad_accounts ORDER BY id LIMIT 1`,
    );
    if (!rows[0]) throw new NotFoundException('No ad account yet. Run a sync first (POST /sync/run).');
    return rows[0];
  }
}