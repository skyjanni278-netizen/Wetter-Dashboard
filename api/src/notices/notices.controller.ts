import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NoticeListSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { NoticesQuerySchema } from './dto/notices-query.schema';
import type { NoticesQuery } from './dto/notices-query.schema';
import type { NoticeList } from './notice';
import { NoticesService } from './notices.service';

/** US20 (N07): Hinweise auf Frost, Hitze und Starkregen aus der Vorhersage, öffentlich (B4.7); R22: kein Query-Parameter. */
@ApiTags('notices')
@Public()
@Controller('notices')
export class NoticesController {
  constructor(private readonly service: NoticesService) {}

  @Get()
  @ApiOperation({
    summary: 'Hinweise auf Frost, Hitze und Starkregen aus der 7-Tage-Vorhersage (US20, R30, R31); kein amtlicher Warnhinweis',
  })
  @ApiZodQuery(NoticesQuerySchema)
  @ApiZodResponse(
    200,
    NoticeListSchema,
    'Hinweise ab heute (Berlin), nach Datum; ohne Vorhersage `items = []`, `basedOnFetchedAt = null`',
  )
  @ApiErrors({ 400: 'VALIDATION_FAILED: `unrecognized_keys` (kein Query-Parameter erlaubt, R22)' })
  findAll(@Query(new ZodValidationPipe(NoticesQuerySchema)) _query: NoticesQuery): Promise<NoticeList> {
    return this.service.findAll();
  }
}
