import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { LOCATIONS } from './location';
import type { Location } from './location';

/** US07-3/-4: Standorte (vorerst ohne Service, Kursmuster „erste Endpunkte“). */
@Controller('locations')
export class LocationsController {
  @Get()
  findAll(): { items: Location[] } {
    return { items: LOCATIONS.map(location => ({ ...location })) };
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Location {
    const location = LOCATIONS.find(l => l.id === id);
    if (!location) {
      throw new NotFoundException(`Standort ${id} nicht gefunden`);
    }
    return { ...location };
  }
}
