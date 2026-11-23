import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CorrectionListSchema } from '../openapi/response.schemas';
import { ApiBearer, ApiErrors, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { ADMIN_ROLE } from '../users/role.entity';
import type { CorrectionList } from './correction';
import { CorrectionsService } from './corrections.service';
import { CorrectionsQuerySchema, MAX_CORRECTION_DAYS } from './dto/corrections-query.schema';
import type { CorrectionsQuery } from './dto/corrections-query.schema';

/**
 * US13-14/-15: Übersicht aller Korrekturen eines Zeitraums, nur lesend und nur für Admins (03 B4.7). Form,
 * Spanne und Pagination prüft die Pipe (R23, R24), R02 der Service.
 */
@ApiTags('corrections')
@ApiBearer()
@Roles(ADMIN_ROLE)
@Controller('corrections')
export class CorrectionsController {
  constructor(private readonly service: CorrectionsService) {}

  @Get()
  @ApiOperation({
    summary: `Korrekturen eines Zeitraums (Berliner Tag von correctedAt, höchstens ${MAX_CORRECTION_DAYS} Tage), neueste zuerst (US13-14)`,
  })
  @ApiZodQuery(CorrectionsQuerySchema)
  @ApiZodResponse(200, CorrectionListSchema, 'Eine Seite; `meta = { page, limit, total }`')
  @ApiErrors({
    400: 'VALIDATION_FAILED (`invalid_date`, `to_before_from`, `range_too_long`, `page`, `limit` 1–100, `unrecognized_keys`) oder DATE_IN_FUTURE an `to`',
  })
  findPage(@Query(new ZodValidationPipe(CorrectionsQuerySchema)) query: CorrectionsQuery): Promise<CorrectionList> {
    return this.service.findPage(query);
  }
}
