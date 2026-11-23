import { ApiException } from './api.exception';

/**
 * Starkes ETag aus der Versionsnummer einer Ressource (03 B3.4): `"3"`. Express übernimmt ein gesetztes ETag
 * und antwortet bei passendem `If-None-Match` (GET) selbst mit 304.
 */
export function etagOf(version: number): string {
  return `"${version}"`;
}

/** Ein starkes Entity-Tag aus Ziffern, z. B. `"3"`; schwache Tags (`W/"3"`) passen bei `If-Match` nie (RFC 9110). */
const STRONG_VERSION_TAG = /^"(\d{1,10})"$/;

/**
 * R17 (Controller): Versionen aus `If-Match`. Fehlt der Header oder ist er leer → 428 `PRECONDITION_REQUIRED`.
 * `*` hieße „irgendeine Fassung“ und würde die Prüfung umgehen; er gilt deshalb wie ein fehlender Header.
 * Eine Liste (`"3", "4"`) ist erlaubt. Einträge ohne Versionsnummer (schwach, ohne Anführungszeichen) passen
 * zu keiner Fassung; der Service antwortet dann mit 412.
 */
export function ifMatchVersions(header: string | undefined): number[] {
  const value = header?.trim() ?? '';
  if (value === '' || value === '*') {
    throw new ApiException(
      428,
      'PRECONDITION_REQUIRED',
      'Der Header If-Match mit der Version (ETag) fehlt. Bitte die Ressource zuerst laden.',
    );
  }
  return value
    .split(',')
    .map(entry => STRONG_VERSION_TAG.exec(entry.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => Number(match[1]));
}
