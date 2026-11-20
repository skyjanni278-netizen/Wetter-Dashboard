import { Controller, Get, Param } from '@nestjs/common';
import { IdParamSchema } from '../common/dto/id-param.schema';
import type { IdParam } from '../common/dto/id-param.schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Location } from './location';
import { LocationsService } from './locations.service';

/** US07-3/-4: Standorte. */
@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @Get()
  findAll(): { items: Location[] } {
    return { items: this.service.findAll() };
  }

  @Get(':id')
  findOne(@Param(new ZodValidationPipe(IdParamSchema)) { id }: IdParam): Location {
    return this.service.findOne(id);
  }
}
