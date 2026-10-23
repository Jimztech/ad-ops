export const MOCK_ACCOUNT = {
  id: 'act_1234567890',
  name: 'Acme Store (Simulated)',
  currency: 'USD',
  timezone_name: 'America/New_York',
};

type Placement = 'facebook' | 'instagram' | 'audience_network';

export type MockCampaign = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  objective: string;
  dailyBudgetUsd: number;
  baseSpend: number; // total daily spend across placements, USD
  ctr: number; // clicks / impressions
  cvr: number; // purchases / clicks
  aov: number; // revenue per purchase, USD
  placements: Placement[];
  pausedDaysAgo?: number; // no data newer than this many days ago
};

export const MOCK_CAMPAIGNS: MockCampaign[] = [
  { id: '120001', name: 'Prospecting - Lookalike 1%', status: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudgetUsd: 150, baseSpend: 140, ctr: 0.012, cvr: 0.025, aov: 62, placements: ['facebook', 'instagram', 'audience_network'] },
  { id: '120002', name: 'Retargeting - Cart Abandoners', status: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudgetUsd: 60, baseSpend: 55, ctr: 0.028, cvr: 0.07, aov: 58, placements: ['facebook', 'instagram'] },
  { id: '120003', name: 'Brand Awareness - Video', status: 'ACTIVE', objective: 'OUTCOME_AWARENESS', dailyBudgetUsd: 80, baseSpend: 75, ctr: 0.006, cvr: 0.004, aov: 55, placements: ['facebook', 'instagram', 'audience_network'] },
  { id: '120004', name: 'Reels - Summer Collection', status: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudgetUsd: 120, baseSpend: 110, ctr: 0.015, cvr: 0.02, aov: 70, placements: ['instagram', 'facebook'] },
  { id: '120005', name: 'Traffic - Blog Content', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC', dailyBudgetUsd: 40, baseSpend: 35, ctr: 0.02, cvr: 0.008, aov: 45, placements: ['facebook', 'audience_network'] },
  { id: '120006', name: 'Holiday Sale - Early Bird', status: 'PAUSED', objective: 'OUTCOME_SALES', dailyBudgetUsd: 90, baseSpend: 85, ctr: 0.014, cvr: 0.022, aov: 66, placements: ['facebook', 'instagram'], pausedDaysAgo: 14 },
];

const PLACEMENT_PROFILE: Record<Placement, { share: number; cpmMult: number; ctrMult: number; cvrMult: number }> = {
  facebook: { share: 0.55, cpmMult: 1.0, ctrMult: 1.0, cvrMult: 1.0 },
  instagram: { share: 0.38, cpmMult: 1.25, ctrMult: 0.9, cvrMult: 1.1 },
  audience_network: { share: 0.07, cpmMult: 0.4, ctrMult: 0.6, cvrMult: 0.5 },
};

const BASE_CPM_USD = 11;
const DAY_MS = 86_400_000;

// Hash a string into a number, so the same (campaign, date, placement) always gives the same random stream.
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Small seeded random number generator: same seed, same sequence.
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type InsightRow = {
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  publisher_platform: string;
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

export function generateInsightRows(since: string, until: string): InsightRow[] {
  const todayMs = Date.parse(new Date().toISOString().slice(0, 10));
  const rows: InsightRow[] = [];

  for (let ms = Date.parse(since); ms <= Date.parse(until); ms += DAY_MS) {
    const date = new Date(ms).toISOString().slice(0, 10);
    const daysAgo = Math.round((todayMs - ms) / DAY_MS);
    if (daysAgo < 1) continue; // Meta has no complete data for today
    const isWeekend = [0, 6].includes(new Date(ms).getUTCDay());

    for (const c of MOCK_CAMPAIGNS) {
      if (c.pausedDaysAgo !== undefined && daysAgo < c.pausedDaysAgo) continue;
      const shareTotal = c.placements.reduce((s, p) => s + PLACEMENT_PROFILE[p].share, 0);

      for (const placement of c.placements) {
        const p = PLACEMENT_PROFILE[placement];
        const rand = mulberry32(hash(`${c.id}|${date}|${placement}`));
        const jitter = (lo: number, hi: number) => lo + rand() * (hi - lo);

        let spend = c.baseSpend * (p.share / shareTotal) * (isWeekend ? 0.85 : 1) * jitter(0.85, 1.15);
        if (c.id === '120002' && daysAgo === 6) spend *= 3; // planted anomaly: spend spike

        const impressions = Math.round((spend / (BASE_CPM_USD * p.cpmMult)) * 1000);
        const clicks = Math.round(impressions * c.ctr * p.ctrMult * jitter(0.8, 1.2));
        let cvr = c.cvr * p.cvrMult;
        if (c.id === '120001' && daysAgo <= 4) cvr *= 0.3; // planted anomaly: conversions collapse
        const purchases = Math.round(clicks * cvr * jitter(0.7, 1.3));
        const revenue = purchases * c.aov * jitter(0.9, 1.1);

        const row: InsightRow = {
          account_id: MOCK_ACCOUNT.id.replace('act_', ''),
          campaign_id: c.id,
          campaign_name: c.name,
          publisher_platform: placement,
          date_start: date,
          date_stop: date,
          spend: spend.toFixed(2),
          impressions: String(impressions),
          clicks: String(clicks),
        };
        // Like the real API, omit these fields entirely when there were no purchases.
        if (purchases > 0) {
          row.actions = [{ action_type: 'purchase', value: String(purchases) }];
          row.action_values = [{ action_type: 'purchase', value: revenue.toFixed(2) }];
        }
        rows.push(row);
      }
    }
  }
  return rows;
}