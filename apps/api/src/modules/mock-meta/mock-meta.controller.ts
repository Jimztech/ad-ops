import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { MOCK_ACCOUNT, MOCK_CAMPAIGNS, generateInsightRows } from './mock-data.js';

const insightsQuery = z.object({
  time_range: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  after: z.coerce.number().int().min(0).default(0),
});

const isoDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

@Controller('mock/meta')
export class MockMetaController {
  @Get(':version/:accountId/campaigns')
  campaigns(@Param('accountId') accountId: string) {
    return {
      data: MOCK_CAMPAIGNS.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        effective_status: c.status,
        objective: c.objective,
        daily_budget: String(Math.round(c.dailyBudgetUsd * 100)), // minor units (cents), as a string
        updated_time: new Date().toISOString(),
      })),
      paging: { cursors: { before: 'MAZDZD', after: 'MAZDZD' } },
    };
  }

  @Get(':version/:accountId/insights')
  insights(
    @Param('version') version: string,
    @Param('accountId') accountId: string,
    @Query() rawQuery: Record<string, string>,
    @Req() req: Request,
  ) {
    const q = insightsQuery.parse(rawQuery);
    const range = q.time_range
      ? (JSON.parse(q.time_range) as { since: string; until: string })
      : { since: isoDay(30), until: isoDay(1) };

    const all = generateInsightRows(range.since, range.until);
    const page = all.slice(q.after, q.after + q.limit);
    const nextOffset = q.after + q.limit;

    const paging: Record<string, unknown> = {
      cursors: { before: String(q.after), after: String(nextOffset) },
    };
    if (nextOffset < all.length) {
      const params = new URLSearchParams({
        time_range: JSON.stringify(range),
        limit: String(q.limit),
        after: String(nextOffset),
      });
      paging.next = `${req.protocol}://${req.get('host')}${req.path}?${params}`;
    }
    return { data: page, paging };
  }
}