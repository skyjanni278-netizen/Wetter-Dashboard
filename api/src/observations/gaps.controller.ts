import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GapListSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { GapsQuerySchema, MAX_GAP_DAYS } from './dto/gaps-query.schema';
import type { GapsQuery } from './dto/gaps-query.schema';
import type { GapList } from './gap';
import { GapsService } from './gaps.service';

/**
 * US12, US14-1: Lücken im Datenbestand. Bis zur Anmeldung (Schritt 10/11) ohne Token, deshalb wie alle
 * Endpunkte nur auf `127.0.0.1`. Form und Spanne prüft die Pipe, R02 der Service.
 */
@ApiTags('gaps')
@Controller('gaps')
export class GapsController {
  constructor(private readonly service: GapsService) {}

  @Get()
  @ApiOperation({
    summary: `Lücken eines Zeitraums (höchstens ${MAX_GAP_DAYS} Tage): fehlende Stunden, null-Werte, veraltete Vorhersagen (US12)`,
  })
  @ApiZodQuery(GapsQuerySchema)
  @ApiZodResponse(200, GapListSchema, 'Lücken aufsteigend nach Zeit; ohne Lücke `items = []`')
  @ApiErrors({
    400: 'VALIDATION_FAILED (`invalid_date`, `to_before_from`, `range_too_long`, `unrecognized_keys`) oder DATE_IN_FUTURE an `to`',
  })
  find(@Query(new ZodValidationPipe(GapsQuerySchema)) { from, to }: GapsQuery): Promise<GapList> {
    return this.service.find(from, to);
  }
}
