import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DayListSchema, DaySchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodParams, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import type { Day, DayList } from './day';
import { DaysService } from './days.service';
import { DateParamSchema } from './dto/date-param.schema';
import type { DateParam } from './dto/date-param.schema';
import { DaysQuerySchema } from './dto/days-query.schema';
import type { DaysQuery } from './dto/days-query.schema';

/** US01 (Grundform), US02 und US04: Tage. Der Controller kennt nur HTTP, die Daten liefert der Service. */
@ApiTags('days')
@Controller('days')
export class DaysController {
  constructor(private readonly service: DaysService) {}

  /** R23 (Form, Reihenfolge, Spanne) prüft die Pipe, R02 (`to` nicht in der Zukunft) der Service. */
  @Get()
  @ApiOperation({ summary: 'Tage eines Zeitraums (höchstens 366 Tage), aufsteigend nach Datum (US04)' })
  @ApiZodQuery(DaysQuerySchema)
  @ApiZodResponse(200, DayListSchema, 'Tage mit Daten; ohne Daten `items = []`')
  @ApiErrors({
    400: 'VALIDATION_FAILED (`invalid_date`, `to_before_from`, `range_too_long`, `unrecognized_keys`) oder DATE_IN_FUTURE an `to`',
  })
  findRange(@Query(new ZodValidationPipe(DaysQuerySchema)) { from, to }: DaysQuery): Promise<DayList> {
    return this.service.findRange(from, to);
  }

  /** `today` ist ein Alias; die kanonische Adresse steht in `Content-Location` (B3.1). */
  @Get('today')
  @ApiOperation({ summary: 'Heutiger Berliner Tag (Alias, Header Content-Location)' })
  @ApiZodResponse(200, DaySchema, 'Tag mit Stunden, Vorhersagestunden getrennt (R08)')
  @ApiErrors({ 404: 'NO_DATA: noch keine Stunde für heute (`details.dataFrom`)' })
  async findToday(@Res({ passthrough: true }) res: Response): Promise<Day> {
    const day = await this.service.findToday();
    res.setHeader('Content-Location', `/api/days/${day.date}`);
    return day;
  }

  /** R01 (Format, Kalendertag) prüft die Pipe, R02 (Zukunft) der Service. */
  @Get(':date')
  @ApiOperation({ summary: 'Ein Berliner Kalendertag (US02)' })
  @ApiZodParams(DateParamSchema)
  @ApiZodResponse(200, DaySchema, 'Tag mit Stunden')
  @ApiErrors({
    400: 'VALIDATION_FAILED (`invalid_date`) oder DATE_IN_FUTURE an `date`',
    404: 'NO_DATA: keine Stunde an diesem Tag (`details.dataFrom`)',
  })
  findOne(@Param(new ZodValidationPipe(DateParamSchema)) { date }: DateParam): Promise<Day> {
    return this.service.findOne(date);
  }
}
