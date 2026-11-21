import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** US14-3: `GET /api/health`. Nutzt nur die globale `DataSource` aus dem `DatabaseModule`, kein Fachmodul. */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
