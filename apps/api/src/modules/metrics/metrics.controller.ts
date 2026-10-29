import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { metricsQuerySchema } from '@adpilot/shared';
import { MetricsService } from './metrics.service.js';

@Controller()
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  @Get('metrics')
  getMetrics(@Query() raw: Record<string, unknown>) {
    const parsed = metricsQuerySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.metrics.getMetrics(parsed.data);
  }

  @Get('campaigns')
  campaigns() {
    return this.metrics.listCampaigns();
  }
}