import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { MockMetaModule } from './modules/mock-meta/mock-meta.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js'


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    MockMetaModule,
    DatabaseModule,
    SyncModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}