import { Controller, Get, Inject, Post } from '@nestjs/common';
import { SyncService } from './sync.service.js';

@Controller('sync')
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Post('run')
  run() {
    return this.sync.run();
  }

  @Get('status')
  status() {
    return this.sync.recentRuns();
  }
}