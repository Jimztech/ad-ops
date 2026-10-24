import { MetaAdapter } from '../src/modules/meta/meta.adapter.js';

const adapter = new MetaAdapter({
  baseUrl: 'http://localhost:3001/mock/meta',
  apiVersion: 'v21.0',
  accountId: 'act_1234567890',
  accessToken: 'mock-token',
});

const campaigns = await adapter.fetchCampaigns();
console.log('campaigns:', campaigns.length, campaigns[0]);

const metrics = await adapter.fetchDailyMetrics('2026-10-10', '2026-10-20');
console.log('metric rows:', metrics.length, metrics[0]);