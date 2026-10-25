import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new pg.Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}