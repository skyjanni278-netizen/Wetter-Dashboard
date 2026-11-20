import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
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
  findOne(@Param('id', ParseIntPipe) id: number): Location {
    return this.service.findOne(id);
  }
}
