import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaAdapter } from '../meta/meta.adapter.js';
import { META_ADAPTER } from './sync.constants.js';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';

@Module({
  controllers: [SyncController],
  providers: [
    {
      provide: META_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new MetaAdapter({
          baseUrl: config.getOrThrow<string>('META_BASE_URL'),
          apiVersion: config.getOrThrow<string>('META_API_VERSION'),
          accountId: config.getOrThrow<string>('META_AD_ACCOUNT_ID'),
          accessToken: config.getOrThrow<string>('META_ACCESS_TOKEN'),
        }),
    },
    SyncService,
  ],
})
export class SyncModule {}