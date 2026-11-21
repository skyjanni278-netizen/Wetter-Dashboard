import { Controller, Get, Param } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { YearMonthParamSchema } from './dto/year-month-param.schema';
import type { YearMonthParam } from './dto/year-month-param.schema';
import { YearParamSchema } from './dto/year-param.schema';
import type { YearParam } from './dto/year-param.schema';
import { SummariesService } from './summaries.service';
import type { MonthSummary, YearSummary } from './summary';

/**
 * US04, US05: Zusammenfassungen je Monat und Jahr. Die Listen `?year=` und `/years` folgen in Schritt 8.
 * R04/R05 (Format, ≥ 1940) prüft die Pipe, R02/R03 der Service.
 */
@Controller('summaries')
export class SummariesController {
  constructor(private readonly service: SummariesService) {}

  @Get('months/:yearMonth')
  findMonth(@Param(new ZodValidationPipe(YearMonthParamSchema)) { yearMonth }: YearMonthParam): Promise<MonthSummary> {
    return this.service.findMonth(yearMonth);
  }

  @Get('years/:year')
  findYear(@Param(new ZodValidationPipe(YearParamSchema)) { year }: YearParam): Promise<YearSummary> {
    return this.service.findYear(year);
  }
}
