import { describe, expect, it } from 'vitest';
import { MetaAdapter } from './meta.adapter.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function makeAdapter(responses: Response[]) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error('test ran out of fake responses');
    return next;
  }) as typeof fetch;

  const adapter = new MetaAdapter({
    baseUrl: 'http://fake',
    apiVersion: 'v21.0',
    accountId: 'act_1',
    accessToken: 'secret-token',
    fetchImpl,
    sleep: async () => {},
  });
  return { adapter, calls };
}

const insight = (overrides: Record<string, unknown> = {}) => ({
  campaign_id: '1',
  publisher_platform: 'instagram',
  date_start: '2026-10-20',
  spend: '12.34',
  impressions: '1000',
  clicks: '25',
  ...overrides,
});

describe('MetaAdapter', () => {
  it('converts strings to numbers and cents to dollars', async () => {
    const { adapter } = makeAdapter([
      json({ data: [{ id: '1', name: 'A', effective_status: 'ACTIVE', daily_budget: '15000' }] }),
    ]);
    const [campaign] = await adapter.fetchCampaigns();
    expect(campaign.dailyBudget).toBe(150);
    expect(campaign.status).toBe('active');
  });

  it('treats a missing actions field as zero conversions', async () => {
    const { adapter } = makeAdapter([json({ data: [insight()] })]);
    const [row] = await adapter.fetchDailyMetrics('2026-10-20', '2026-10-20');
    expect(row.conversions).toBe(0);
    expect(row.revenue).toBe(0);
    expect(row.spend).toBe(12.34);
  });

  it('does not double-count purchases listed under several action types', async () => {
    const { adapter } = makeAdapter([
      json({
        data: [
          insight({
            actions: [
              { action_type: 'omni_purchase', value: '3' },
              { action_type: 'purchase', value: '3' },
            ],
            action_values: [
              { action_type: 'omni_purchase', value: '180.00' },
              { action_type: 'purchase', value: '180.00' },
            ],
          }),
        ],
      }),
    ]);
    const [row] = await adapter.fetchDailyMetrics('2026-10-20', '2026-10-20');
    expect(row.conversions).toBe(3);
    expect(row.revenue).toBe(180);
  });

  it('maps other placements to "other" instead of failing', async () => {
    const { adapter } = makeAdapter([json({ data: [insight({ publisher_platform: 'whatsapp_beta' })] })]);
    const [row] = await adapter.fetchDailyMetrics('2026-10-20', '2026-10-20');
    expect(row.publisherPlatform).toBe('other');
  });

  it('follows pagination until there is no next link', async () => {
    const { adapter, calls } = makeAdapter([
      json({ data: [insight({ campaign_id: '1' })], paging: { next: 'http://fake/page2' } }),
      json({ data: [insight({ campaign_id: '2' })] }),
    ]);
    const rows = await adapter.fetchDailyMetrics('2026-10-20', '2026-10-20');
    expect(rows.map((r) => r.campaignExternalId)).toEqual(['1', '2']);
    expect(calls[1]).toBe('http://fake/page2');
  });

  it('retries after a server error and then succeeds', async () => {
    const { adapter, calls } = makeAdapter([
      json({ error: { message: 'boom' } }, 500),
      json({ data: [] }),
    ]);
    await adapter.fetchCampaigns();
    expect(calls).toHaveLength(2);
  });

  it('does not retry a bad token, and does not leak it in the error', async () => {
    const { adapter, calls } = makeAdapter([
      json({ error: { code: 190, message: 'Invalid OAuth access token' } }, 401),
    ]);
    const error = await adapter.fetchCampaigns().catch((e: Error) => e);
    expect(calls).toHaveLength(1);
    expect((error as Error).message).toContain('190');
    expect((error as Error).message).not.toContain('secret-token');
  });
});