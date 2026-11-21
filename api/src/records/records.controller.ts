import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecordsQuerySchema } from './dto/records-query.schema';
import type { RecordsQuery } from './dto/records-query.schema';
import type { Records } from './record';
import { RecordsService } from './records.service';

/** US06: Rekorde. Der Controller kennt nur HTTP, die Regeln liegen im `AggregationService`. */
@Controller('records')
export class RecordsController {
  constructor(private readonly service: RecordsService) {}

  @Get()
  find(@Query(new ZodValidationPipe(RecordsQuerySchema)) _query: RecordsQuery): Promise<Records> {
    return this.service.find();
  }
}
