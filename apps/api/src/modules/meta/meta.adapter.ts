import {
  campaignSchema,
  dailyMetricSchema,
  publisherPlatformSchema,
  type Campaign,
  type DailyMetric,
  type PlatformAdapter,
  type PublisherPlatform,
} from '@adpilot/shared';
import { z } from 'zod';

// ---- 1. Schemas for what Meta sends us (the "raw" shape) ----
// Meta sends numbers as strings, and omits fields it has no value for,
// so almost everything is a string and many fields are optional.

const rawCampaign = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  effective_status: z.string().optional(),
  objective: z.string().optional(),
  daily_budget: z.string().optional(), // minor units (cents), as a string
});

const rawAction = z.object({ action_type: z.string(), value: z.string() });

const rawInsight = z.object({
  campaign_id: z.string(),
  publisher_platform: z.string().optional(),
  date_start: z.string(),
  spend: z.string().optional(),
  impressions: z.string().optional(),
  clicks: z.string().optional(),
  actions: z.array(rawAction).optional(), // missing when there were no conversions
  action_values: z.array(rawAction).optional(),
});

const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z.object({ next: z.string().optional() }).optional(),
  });

// ---- 2. Small conversion helpers ----

function toNumber(value: string | undefined): number {
  const n = Number(value ?? '0');
  if (!Number.isFinite(n)) throw new Error(`Meta returned a non-numeric value: "${value}"`);
  return n;
}

// Meta reports the same purchase under several action types
// (e.g. "omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase").
// Adding them up would count each purchase 2-3 times, so we pick ONE, in priority order.
const PURCHASE_TYPES = ['omni_purchase', 'purchase'];

function pickPurchase(list: z.infer<typeof rawAction>[] | undefined): number {
  if (!list) return 0; // no field means no purchases
  for (const type of PURCHASE_TYPES) {
    const found = list.find((a) => a.action_type === type);
    if (found) return toNumber(found.value);
  }
  return 0;
}

function mapStatus(raw: string | undefined): Campaign['status'] {
  if (raw === 'ACTIVE') return 'active';
  if (raw === 'PAUSED' || raw === 'CAMPAIGN_PAUSED') return 'paused';
  if (raw === 'ARCHIVED' || raw === 'DELETED') return 'archived';
  return 'paused'; // unknown states: never claim a campaign is running when we aren't sure
}

function mapPlatform(raw: string | undefined): PublisherPlatform {
  const parsed = publisherPlatformSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'other'; // keep the spend, label it "unknown"
}

// ---- 3. Retry settings ----

// Meta rate-limit error codes. These can come back with HTTP 400, not 429.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const MAX_PAGES = 200; // stops an endless loop if the API ever repeats a "next" link

export type MetaAdapterOptions = {
  baseUrl: string;
  apiVersion: string;
  accountId: string; // e.g. "act_1234567890"
  accessToken: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch; // replaceable so tests don't need a server
  sleep?: (ms: number) => Promise<void>; // replaceable so tests don't actually wait
};

export class MetaAdapter implements PlatformAdapter {
  readonly channel = 'meta' as const;

  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly accountId: string;
  private readonly accessToken: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: MetaAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiVersion = options.apiVersion;
    this.accountId = options.accountId;
    this.accessToken = options.accessToken;
    this.maxRetries = options.maxRetries ?? 4;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async fetchCampaigns(): Promise<Campaign[]> {
    const url = this.buildUrl('campaigns', {
      fields: 'id,name,status,effective_status,objective,daily_budget,updated_time',
      limit: '100',
    });
    const rows = await this.getAllPages(url, rawCampaign);

    return rows.map((r) =>
      campaignSchema.parse({
        externalId: r.id,
        channel: this.channel,
        name: r.name,
        status: mapStatus(r.effective_status ?? r.status),
        objective: r.objective ?? null,
        dailyBudget: r.daily_budget ? toNumber(r.daily_budget) / 100 : null, // cents -> dollars
      }),
    );
  }

  async fetchDailyMetrics(from: string, to: string): Promise<DailyMetric[]> {
    const url = this.buildUrl('insights', {
      level: 'campaign',
      time_increment: '1', // one row per day
      breakdowns: 'publisher_platform', // split by Facebook / Instagram / ...
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',
      time_range: JSON.stringify({ since: from, until: to }),
      limit: '500',
    });
    const rows = await this.getAllPages(url, rawInsight);

    return rows.map((r) =>
      dailyMetricSchema.parse({
        campaignExternalId: r.campaign_id,
        date: r.date_start,
        publisherPlatform: mapPlatform(r.publisher_platform),
        spend: toNumber(r.spend),
        impressions: toNumber(r.impressions),
        clicks: toNumber(r.clicks),
        conversions: pickPurchase(r.actions),
        revenue: pickPurchase(r.action_values),
      }),
    );
  }

  // ---- internals ----

  private buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${this.accountId}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('access_token', this.accessToken);
    return url.toString();
  }

  // Follows "paging.next" links until there are none left.
  private async getAllPages<S extends z.ZodType>(firstUrl: string, itemSchema: S): Promise<z.infer<S>[]> {
    const schema = pageSchema(itemSchema);
    const all: z.infer<S>[] = [];
    let url: string | undefined = firstUrl;

    for (let i = 0; url && i < MAX_PAGES; i++) {
      const page = schema.parse(await this.request(url));
      all.push(...(page.data as z.infer<S>[]));
      url = page.paging?.next;
    }
    if (url) throw new Error(`Meta pagination exceeded ${MAX_PAGES} pages`);
    return all;
  }

  // One HTTP call, with retries for failures that are worth retrying.
  private async request(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url);
      } catch {
        if (attempt >= this.maxRetries) throw new Error('Meta request failed: network error');
        await this.sleep(this.backoff(attempt));
        continue;
      }

      if (res.ok) return res.json();

      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: number; message?: string } }
        | null;
      const code = body?.error?.code;
      const retryable =
        res.status === 429 || res.status >= 500 || (code !== undefined && RATE_LIMIT_CODES.has(code));

      if (!retryable || attempt >= this.maxRetries) {
        // Deliberately NOT including the URL: it contains the access token.
        throw new Error(
          `Meta API error ${res.status}${code ? ` (code ${code})` : ''}: ${body?.error?.message ?? res.statusText}`,
        );
      }

      const retryAfter = Number(res.headers.get('retry-after'));
      await this.sleep(retryAfter > 0 ? retryAfter * 1000 : this.backoff(attempt));
    }
  }

  // 0.5s, 1s, 2s, 4s... (max 8s) plus a little random jitter.
  private backoff(attempt: number): number {
    return Math.min(500 * 2 ** attempt, 8000) + Math.random() * 250;
  }
}