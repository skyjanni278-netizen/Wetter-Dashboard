import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  MonthSummaryListSchema,
  MonthSummarySchema,
  YearListSchema,
  YearSummarySchema,
} from '../openapi/response.schemas';
import { ApiErrors, ApiZodParams, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { MonthsQuerySchema, YearsQuerySchema } from './dto/summaries-query.schema';
import type { MonthsQuery, YearsQuery } from './dto/summaries-query.schema';
import { YearMonthParamSchema } from './dto/year-month-param.schema';
import type { YearMonthParam } from './dto/year-month-param.schema';
import { YearParamSchema } from './dto/year-param.schema';
import type { YearParam } from './dto/year-param.schema';
import { SummariesService } from './summaries.service';
import type { MonthSummary, MonthSummaryList, YearList, YearSummary } from './summary';

/**
 * US04, US05: Zusammenfassungen je Monat und Jahr und ihre Listen (fest aufsteigend sortiert, B3.1).
 * R04/R05 (Format, ≥ 1940) und R22 prüft die Pipe, R02/R03 der Service.
 */
@ApiTags('summaries')
@Public()
@Controller('summaries')
export class SummariesController {
  constructor(private readonly service: SummariesService) {}

  @Get('months')
  @ApiOperation({ summary: 'Monatszusammenfassungen eines Jahres, nur Monate mit Daten, aufsteigend (US05)' })
  @ApiZodQuery(MonthsQuerySchema)
  @ApiZodResponse(200, MonthSummaryListSchema, 'Monate des Jahres mit Daten')
  @ApiErrors({
    400: 'VALIDATION_FAILED an `year` (R05) bzw. `unrecognized_keys`, oder DATE_IN_FUTURE an `year`',
    404: 'NO_DATA: keine Stunde im Jahr (`details.dataFrom`)',
  })
  findMonths(@Query(new ZodValidationPipe(MonthsQuerySchema)) { year }: MonthsQuery): Promise<MonthSummaryList> {
    return this.service.findMonths(year);
  }

  @Get('months/:yearMonth')
  @ApiOperation({ summary: 'Zusammenfassung eines Monats (US04)' })
  @ApiZodParams(YearMonthParamSchema)
  @ApiZodResponse(200, MonthSummarySchema, 'Monatszusammenfassung, nur vollständige Tage (R12, R13)')
  @ApiErrors({
    400: 'VALIDATION_FAILED an `yearMonth` (R04) oder DATE_IN_FUTURE an `yearMonth`',
    404: 'NO_DATA: keine Stunde im Monat (`details.dataFrom`)',
  })
  findMonth(@Param(new ZodValidationPipe(YearMonthParamSchema)) { yearMonth }: YearMonthParam): Promise<MonthSummary> {
    return this.service.findMonth(yearMonth);
  }

  @Get('years')
  @ApiOperation({ summary: 'Jahre mit Daten, aufsteigend, für die Jahresauswahl (US04-8)' })
  @ApiZodQuery(YearsQuerySchema)
  @ApiZodResponse(200, YearListSchema, 'Jahre mit Daten; ohne Daten `items = []`')
  @ApiErrors({ 400: 'VALIDATION_FAILED: `unrecognized_keys` (kein Query-Parameter erlaubt, R22)' })
  findYears(@Query(new ZodValidationPipe(YearsQuerySchema)) _query: YearsQuery): Promise<YearList> {
    return this.service.findYears();
  }

  @Get('years/:year')
  @ApiOperation({ summary: 'Zusammenfassung eines Jahres (US05)' })
  @ApiZodParams(YearParamSchema)
  @ApiZodResponse(200, YearSummarySchema, 'Jahreszusammenfassung, Mittel der Tagesmittel (R12)')
  @ApiErrors({
    400: 'VALIDATION_FAILED an `year` (R05) oder DATE_IN_FUTURE an `year`',
    404: 'NO_DATA: keine Stunde im Jahr (`details.dataFrom`)',
  })
  findYear(@Param(new ZodValidationPipe(YearParamSchema)) { year }: YearParam): Promise<YearSummary> {
    return this.service.findYear(year);
  }
}
