import type {
  DataRange,
  ObservationHour,
  ObservationInput,
  StoredDay,
  UpsertCounts,
  UpsertMode,
} from './observation';

/** DI-Token für den `ObservationStore` (Schritt 3: In-Memory, Schritt 9: TypeORM). */
export const OBSERVATION_STORE = 'OBSERVATION_STORE';

export interface UpsertOptions {
  mode: UpsertMode;
  /** Import, der die Stunden liefert (in Schritt 9 Spalte `import_id`). */
  importId: number;
}

/**
 * Zugriff auf gespeicherte Stundenwerte. Services kennen nur diese Schnittstelle,
 * nicht die Ablage (Dateien, Arbeitsspeicher, Datenbank).
 */
export interface ObservationStore {
  /** Stunden eines Berliner Kalendertags in zeitlicher Reihenfolge oder `null`, wenn es keine gibt. */
  getDay(date: string): Promise<ObservationHour[] | null>;

  /**
   * Alle Tage mit mindestens einer Stunde von `from` bis `to` (Berliner Kalendertage, beide eingeschlossen),
   * aufsteigend nach Datum. Grundlage der Auswertungen (`AggregationService`); Schritt 9 tauscht nur diese
   * Abfrage gegen SQL.
   */
  getRange(from: string, to: string): Promise<StoredDay[]>;

  /** Erster und letzter Berliner Kalendertag mit Daten. */
  getDataRange(): Promise<DataRange>;

  /**
   * Datenrevision (03 B2.4): ändert sich mit jedem Schreibvorgang und ist Schlüssel des Caches für
   * `records` und `summaries/years`. `null` = nicht zwischenspeicherbar (In-Memory-Store: die Datei für heute
   * ändert sich ohne Schreibvorgang des Stores).
   */
  getRevision(): Promise<string | null>;

  /**
   * Schreibt Stunden als Ganzes (alles oder nichts) und zählt neue, geänderte und unveränderte Stunden.
   * Der Berliner Kalendertag ergibt sich aus `timeUtc` (BerlinTime).
   */
  upsertHours(hours: readonly ObservationInput[], options: UpsertOptions): Promise<UpsertCounts>;
}
