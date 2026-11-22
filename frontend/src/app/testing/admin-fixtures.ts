/**
 * Testdaten für die Specs des Admin-Bereichs (nur von `*.spec.ts` importiert, nicht im Bundle).
 * Formen wie die API (3a.2, B2.2).
 */
import type { ApiError, Gap, ImportList, ImportResource, Status } from '../models/api';

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
    lastSuccessfulUpdateAt: '2026-11-22T12:00:00Z', updateState: 'ok',
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
