import type { ObservationSource } from '../observations/observation';

/**
 * Tag nach 03 B2.2 (Schritt 7: berechnete Felder). Stundenwerte sind ungerundet wie gespeichert,
 * berechnete Werte (`observed`, `predicted`) auf eine Nachkommastelle gerundet (R11, `round1`).
 * Noch nicht enthalten (Schritt 9, Datenbank): `hours[].id` und `current.observationId` (bis dahin `null`).
 */
export interface DayHour {
  /** Berliner Ortszeit; im Altbestand ohne Offset, z. B. `2026-11-10T14:00` (Befund Z1). */
  timeLocal: string;
  temperature: number | null;
  apparentTemperature: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  /** Herkunft (B2.2); `null` = unbekannt (Altbestand bis Schritt 9). */
  source: ObservationSource | null;
  /** R08: Vorhersage (gespeichert als solche oder Stunde nach „jetzt“). */
  isPrediction: boolean;
  /** Korrekturen gibt es ab Schritt 12a; bis dahin immer `null`. */
  correctedAt: string | null;
}

export interface DayTemperature {
  mean: number | null;
  min: number | null;
  max: number | null;
  minAt: string | null;
  maxAt: string | null;
}

export interface DayCurrent {
  /** Bis Schritt 9 `null` (keine IDs im Arbeitsspeicher); die Stunde findet man über `timeLocal`. */
  observationId: number | null;
  timeLocal: string;
}

export interface Day {
  id: string;
  date: string;
  locationId: number;
  timezone: string;
  isToday: boolean;
  hoursExpected: number;
  hoursObserved: number;
  hoursPredicted: number;
  complete: boolean;
  current: DayCurrent | null;
  observed: {
    temperature: DayTemperature;
    precipitationSum: number | null;
    isDryDay: boolean | null;
  };
  predicted: {
    temperature: { min: number | null; max: number | null };
    precipitationSum: number | null;
  };
  hours: DayHour[];
}

/**
 * Listeneintrag von `GET /api/days?from&to` (03 B2.2 „day (Listeneintrag)“): schlanker als `Day`, ohne
 * Stunden. Werte wie `Day.observed` (nur vergangene Stunden, R08), gerundet (R11).
 */
export interface DayListItem {
  id: string;
  date: string;
  locationId: number;
  hoursExpected: number;
  hoursObserved: number;
  complete: boolean;
  temperature: { mean: number | null; min: number | null; max: number | null };
  precipitationSum: number | null;
  isDryDay: boolean | null;
  /** Korrekturen gibt es ab Schritt 12a; bis dahin immer `false`. */
  hasCorrections: boolean;
}

/** `GET /api/days?from&to`: Tage mit Daten aufsteigend; `meta.count` = Zahl der Einträge (B2.2). */
export interface DayList {
  items: DayListItem[];
  meta: { from: string; to: string; count: number };
}
