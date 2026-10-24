import { Module } from '@nestjs/common';
import { MockMetaController } from './mock-meta.controller.js';

@Module({ controllers: [MockMetaController] })
export class MockMetaModule {}