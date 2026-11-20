import { Controller, Get } from '@nestjs/common';
import { BERLIN_TIMEZONE } from '../common/berlin-time';
import { LegacyFileSource } from '../legacy/legacy-file-source';
import { HEUBACH } from '../locations/location';
import type { Status } from './status';

/** US07-1/-2: Datenstand (vorerst ohne Service). */
@Controller('status')
export class StatusController {
  constructor(private readonly source: LegacyFileSource) {}

  @Get()
  async find(): Promise<Status> {
    const range = await this.source.getDataRange();
    return {
      locationId: HEUBACH.id,
      today: this.source.today(),
      timezone: BERLIN_TIMEZONE,
      dataFrom: range.from,
      dataTo: range.to,
      // Nest hat noch keinen eigenen Import; Express schreibt bis Schritt 9 (F32: ehrlicher Anfangszustand).
      lastSuccessfulUpdateAt: null,
      updateState: 'never',
    };
  }
}
