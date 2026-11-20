import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
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
      throw ApiException.notFound(`Den Standort ${id} gibt es nicht.`);
    }
    return { ...location };
  }
}
