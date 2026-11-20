import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Day } from './day';
import { DaysService } from './days.service';
import { DateParamSchema } from './dto/date-param.schema';
import type { DateParam } from './dto/date-param.schema';

/** US01 (Grundform) und US02: Tage. Der Controller kennt nur HTTP, die Daten liefert der Service. */
@Controller('days')
export class DaysController {
  constructor(private readonly service: DaysService) {}

  /** `today` ist ein Alias; die kanonische Adresse steht in `Content-Location` (B3.1). */
  @Get('today')
  async findToday(@Res({ passthrough: true }) res: Response): Promise<Day> {
    const day = await this.service.findToday();
    res.setHeader('Content-Location', `/api/days/${day.date}`);
    return day;
  }

  /** R01 (Format, Kalendertag) prüft die Pipe, R02 (Zukunft) der Service. */
  @Get(':date')
  findOne(@Param(new ZodValidationPipe(DateParamSchema)) { date }: DateParam): Promise<Day> {
    return this.service.findOne(date);
  }
}
