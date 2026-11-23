import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { ForecastsModule } from '../forecasts/forecasts.module';
import { NoticeThreshold } from './notice-threshold.entity';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

/**
 * Hinweise aus der Vorhersage (N07, 03 B4.1; Schritt 12c): `GET /api/notices`. Importiert `ForecastsModule`
 * (`FORECAST_STORE`) und besitzt die Entity `NoticeThreshold`. Die Richtung zeigt nach unten:
 * `ForecastsModule` kennt dieses Modul nicht, deshalb entsteht kein Zyklus.
 */
@Module({
  imports: [CommonModule, ForecastsModule, TypeOrmModule.forFeature([NoticeThreshold])],
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
