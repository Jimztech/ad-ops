import { z } from 'zod';
import { publisherPlatformSchema } from './platform.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

export const metricsQuerySchema = z
  .object({
    from: day,
    to: day,
    groupBy: z.enum(['day', 'campaign', 'platform']).default('day'),
    platform: publisherPlatformSchema.optional(),
    campaignId: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => q.from <= q.to, { message: '"from" must be on or before "to"' });
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

export type MetricTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
};

export type MetricsRow = MetricTotals & { key: string; label: string };

export type MetricsResult = {
  currency: string;
  from: string;
  to: string;
  groupBy: MetricsQuery['groupBy'];
  rows: MetricsRow[];
  totals: MetricTotals;
  truncated: boolean;
};