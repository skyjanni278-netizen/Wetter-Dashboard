/**
 * Testdaten für die Specs des Admin-Bereichs (nur von `*.spec.ts` importiert, nicht im Bundle).
 * Formen wie die API (3a.2, B2.2).
 */
import type {
  ApiError, CorrectionListItem, Gap, ImportList, ImportResource, ObservationResource, Status,
} from '../models/api';

export function importResource(overrides: Partial<ImportResource> = {}): ImportResource {
  const id = overrides.id ?? 12;
  return {
    id, locationId: 1, kind: 'range', status: 'queued', from: '2026-10-01', to: '2026-10-31',
    overwriteCorrections: false, requestedBy: null, requestedAt: '2026-11-22T13:05:00Z', startedAt: null, finishedAt: null,
    counts: { inserted: 0, updated: 0, unchanged: 0, skippedCorrected: 0 }, warnings: [], error: null,
    links: { self: `/api/imports/${id}` },
    ...overrides,
  };
}

export function importList(items: ImportResource[], meta: Partial<ImportList['meta']> = {}): ImportList {
  return { items, meta: { page: 1, limit: 20, total: items.length, ...meta } };
}

export function statusOf(overrides: Partial<Status> = {}): Status {
  return {
    locationId: 1, today: '2026-11-22', timezone: 'Europe/Berlin', dataFrom: '2025-01-01', dataTo: '2026-11-22',
    lastSuccessfulUpdateAt: '2026-11-22T12:00:00Z', nextScheduledUpdateAt: null, updateState: 'ok',
    daysWithData: 691, daysComplete: 690, gapCount: 0,
    ...overrides,
  };
}

export function gap(overrides: Partial<Gap> = {}): Gap {
  return {
    id: '2026-11-12T03:00:00Z', from: '2026-11-12T04:00:00+01:00', to: '2026-11-12T09:00:00+01:00', hours: 6, reason: 'missing',
    ...overrides,
  };
}

export function apiErrorBody(
  statusCode: number, code: string, message: string, errors: ApiError['errors'] = [], details: ApiError['details'] = null,
): ApiError {
  return { statusCode, error: 'Error', code, message, errors, details };
}

export function observation(overrides: Partial<ObservationResource> = {}): ObservationResource {
  return {
    id: 16503, locationId: 1, timeUtc: '2026-11-19T13:00:00Z', timeLocal: '2026-11-19T14:00:00+01:00',
    localDate: '2026-11-19', temperature: 19.6, apparentTemperature: 5.1, precipitation: 0.4, weatherCode: 61,
    windSpeed: 21.3, windDirection: 232, source: 'forecast_api', isPrediction: false, importId: 7,
    fetchedAt: '2026-11-19T13:05:12Z', correctedAt: null, version: 3,
    ...overrides,
  };
}

export function correction(overrides: Partial<CorrectionListItem> = {}): CorrectionListItem {
  return {
    id: 3, observationId: 16503, observationTimeLocal: '2026-11-19T14:00:00+01:00', field: 'temperature',
    oldValue: 19.6, newValue: 9.6, reason: 'Ausreißer, Nachbarstunden 9,4/9,8 °C', correctedBy: 1,
    correctedAt: '2026-11-19T13:20:00Z', revertsCorrectionId: null,
    ...overrides,
  };
}
