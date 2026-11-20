import { BERLIN_TIMEZONE } from '../common/berlin-time';

/** Standort nach B2.2 (`createdAt` folgt mit der Datenbank in Schritt 9). */
export interface Location {
  id: number;
  slug: string;
  name: string;
  postalCode: string;
  region: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isDefault: boolean;
}

/** Bis Schritt 9 gibt es genau einen Standort als Konstante. */
export const HEUBACH: Readonly<Location> = Object.freeze({
  id: 1,
  slug: 'heubach',
  name: 'Heubach',
  postalCode: '73540',
  region: 'Ostalbkreis',
  latitude: 48.7936,
  longitude: 9.9369,
  timezone: BERLIN_TIMEZONE,
  isDefault: true,
});

export const LOCATIONS: readonly Readonly<Location>[] = [HEUBACH];
