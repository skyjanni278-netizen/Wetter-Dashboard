import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GapListSchema } from '../openapi/response.schemas';
import { ApiBearer, ApiErrors, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { ADMIN_ROLE } from '../users/role.entity';
import { GapsQuerySchema, MAX_GAP_DAYS } from './dto/gaps-query.schema';
import type { GapsQuery } from './dto/gaps-query.schema';
import type { GapList } from './gap';
import { GapsService } from './gaps.service';

/**
 * US12, US14-1: Lücken im Datenbestand. Nur für Admins (03 B4.7): ohne gültiges Token 401 (US12-4), ohne Rolle
 * `admin` 403. Form und Spanne prüft die Pipe, R02 der Service.
 */
@ApiTags('gaps')
@ApiBearer()
@Roles(ADMIN_ROLE)
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
