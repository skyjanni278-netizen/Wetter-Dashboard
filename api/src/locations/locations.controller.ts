import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdParamSchema } from '../common/dto/id-param.schema';
import { Public } from '../common/public.decorator';
import type { IdParam } from '../common/dto/id-param.schema';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LocationListSchema, LocationSchema } from '../openapi/response.schemas';
import { ApiErrors, ApiZodParams, ApiZodResponse } from '../openapi/zod-openapi';
import type { Location } from './location';
import { LocationsService } from './locations.service';

/** US07-3/-4: Standorte. */
@ApiTags('locations')
@Public()
@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @Get()
  @ApiOperation({ summary: 'Alle Standorte (genau Heubach)' })
  @ApiZodResponse(200, LocationListSchema, 'Standorte')
  @ApiErrors()
  findAll(): { items: Location[] } {
    return { items: this.service.findAll() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ein Standort' })
  @ApiZodParams(IdParamSchema)
  @ApiZodResponse(200, LocationSchema, 'Standort')
  @ApiErrors({ 400: 'VALIDATION_FAILED an `id`', 404: 'NOT_FOUND: Standort unbekannt' })
  findOne(@Param(new ZodValidationPipe(IdParamSchema)) { id }: IdParam): Location {
    return this.service.findOne(id);
  }
}
