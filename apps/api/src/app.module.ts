import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MockMetaModule } from './modules/mock-meta/mock-meta.module.js';

@Module({
  imports: [MockMetaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
