/**
 * Ladezustand einer Seite (V02): idle → loading → success | empty | error.
 * Bei empty/error sind die Daten null, bei loading bleiben vorhandene Daten sichtbar.
 */
export type LoadState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

/** Ergebnis eines Ladevorgangs; bei state 'loading' wird data nicht übernommen. */
export interface LoadResult<T> {
  state: LoadState;
  data: T | null;
  message: string | null;
}
