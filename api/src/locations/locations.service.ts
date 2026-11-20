import { Injectable, NotFoundException } from '@nestjs/common';
import { LOCATIONS } from './location';
import type { Location } from './location';

/** US07-3/-4: Standorte. Bis Schritt 9 eine Konstante, danach aus der Datenbank. */
@Injectable()
export class LocationsService {
  findAll(): Location[] {
    return LOCATIONS.map(location => ({ ...location }));
  }

  findOne(id: number): Location {
    const location = LOCATIONS.find(l => l.id === id);
    if (!location) {
      throw new NotFoundException(`Standort ${id} nicht gefunden`);
    }
    return { ...location };
  }
}
