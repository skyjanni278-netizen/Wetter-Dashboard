import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Day } from './day';
import { DaysService } from './days.service';

/** US01 (Grundform) und US02-1: Tage. Der Controller kennt nur HTTP, die Daten liefert der Service. */
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

  @Get(':date')
  findOne(@Param('date') date: string): Promise<Day> {
    return this.service.findOne(date);
  }
}
