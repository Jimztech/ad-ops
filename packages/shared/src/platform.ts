import { z } from 'zod';

export const channelSchema = z.enum(['meta']);
export type Channel = z.infer<typeof channelSchema>;

export const publisherPlatformSchema = z.enum([
  'facebook',
  'instagram',
  'other',
]);

export type PublisherPlatform = z.infer<typeof publisherPlatformSchema>;


export const campaignSchema = z.object({
  externalId: z.string(),
  channel: channelSchema,
  name: z.string(),
  status: z.enum(['active', 'paused', 'archived']),
  objective: z.string().nullable(),
  dailyBudget: z.number().nullable(),
});
export type Campaign = z.infer<typeof campaignSchema>;

export const dailyMetricSchema = z.object({
  campaignExternalId: z.string(),
  date: z.string(), // YYYY-MM-DD
  publisherPlatform: publisherPlatformSchema,
  spend: z.number(),
  impressions: z.number().int(),
  clicks: z.number().int(),
  conversions: z.number(),
  revenue: z.number(),
});
export type DailyMetric = z.infer<typeof dailyMetricSchema>;

export interface PlatformAdapter {
  channel: Channel;
  fetchCampaigns(): Promise<Campaign[]>;
  fetchDailyMetrics(from: string, to: string): Promise<DailyMetric[]>;
}