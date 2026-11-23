import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminApiService, MERGE_PATCH_CONTENT_TYPE } from './admin-api.service';
import { apiErrorInterceptor, apiErrorOf } from '../interceptors/api-error.interceptor';
import { apiErrorBody, correction, importResource, observation } from '../testing/admin-fixtures';
import type { VersionedObservation } from '../models/api';

describe('AdminApiService (US10–US14)', () => {
  let service: AdminApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiErrorInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getImports ohne Angaben: GET /api/imports ohne Query (Server-Standard page = 1, limit = 20)', () => {
    service.getImports().subscribe();
    const req = http.expectOne('/api/imports');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ items: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  it('getImports mit status, kind, page und limit (US11-2); undefined entfällt', () => {
    let total = -1;
    service.getImports({ status: 'failed', page: 2, limit: 20 }).subscribe(list => (total = list.meta.total));
    const req = http.expectOne('/api/imports?status=failed&page=2&limit=20');
    expect(req.request.params.has('kind')).toBe(false);
    req.flush({ items: [importResource({ status: 'failed' })], meta: { page: 2, limit: 20, total: 21 } });
    expect(total).toBe(21);

    service.getImports({ kind: 'gaps' }).subscribe();
    http.expectOne('/api/imports?kind=gaps').flush({ items: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  it('getImport(id): GET /api/imports/:id', () => {
    let status = '';
    service.getImport(42).subscribe(item => (status = item.status));
    http.expectOne('/api/imports/42').flush(importResource({ id: 42, status: 'running' }));
    expect(status).toBe('running');
  });

  it('createImport: POST /api/imports mit dem Body unverändert (US10-3)', () => {
    let id = 0;
    service.createImport({ kind: 'gaps', from: '2026-11-01', to: '2026-11-19' }).subscribe(item => (id = item.id));
    const req = http.expectOne('/api/imports');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ kind: 'gaps', from: '2026-11-01', to: '2026-11-19' });
    req.flush(importResource({ id: 43, kind: 'gaps' }), { status: 202, statusText: 'Accepted', headers: { Location: '/api/imports/43' } });
    expect(id).toBe(43);
  });

  it('createImport: 409 IMPORT_RUNNING kommt mit details.runningImportId beim Aufrufer an (US10-7)', () => {
    let error: unknown;
    service.createImport({ kind: 'range', from: '2026-10-01', to: '2026-10-31' }).subscribe({ error: e => (error = e) });
    http.expectOne('/api/imports').flush(
      { statusCode: 409, error: 'Conflict', code: 'IMPORT_RUNNING', message: 'Es läuft bereits ein Import.', errors: [], details: { runningImportId: 42 } },
      { status: 409, statusText: 'Conflict' },
    );
    expect(apiErrorOf(error).code).toBe('IMPORT_RUNNING');
    expect(apiErrorOf(error).details).toEqual({ runningImportId: 42 });
  });

  it('getGaps(from, to): GET /api/gaps?from&to (US12-1)', () => {
    let count = -1;
    service.getGaps('2026-11-01', '2026-11-19').subscribe(list => (count = list.items.length));
    const req = http.expectOne('/api/gaps?from=2026-11-01&to=2026-11-19');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    req.flush({ items: [{ id: '2026-11-12T03:00:00Z', from: '2026-11-12T04:00:00+01:00', to: '2026-11-12T09:00:00+01:00', hours: 6, reason: 'missing' }] });
    expect(count).toBe(1);
  });

  it('getHealth: GET /api/health; 503 kommt als Fehler (US14-3)', () => {
    let ok = '';
    service.getHealth().subscribe(h => (ok = h.database));
    http.expectOne('/api/health').flush({ status: 'ok', database: 'ok' });
    expect(ok).toBe('ok');

    let status = 0;
    service.getHealth().subscribe({ error: e => (status = apiErrorOf(e).statusCode) });
    http.expectOne('/api/health').flush(
      { statusCode: 503, error: 'Service Unavailable', code: 'SERVICE_UNAVAILABLE', message: 'x', errors: [], details: { database: 'error' } },
      { status: 503, statusText: 'Service Unavailable' },
    );
    expect(status).toBe(503);
  });

  describe('Korrekturen (US13, B3.4)', () => {
    it('getObservation: GET /api/observations/:id liefert die Stunde und den ETag-Header (US13-1)', () => {
      let result = null as VersionedObservation | null;
      service.getObservation(16503).subscribe(r => (result = r));
      const req = http.expectOne('/api/observations/16503');
      expect(req.request.method).toBe('GET');
      req.flush(observation(), { headers: { ETag: '"3"' } });
      expect(result!.etag).toBe('"3"');
      expect(result!.observation.temperature).toBe(19.6);
    });

    it('getObservation ohne ETag-Header: etag = null', () => {
      let result = null as VersionedObservation | null;
      service.getObservation(1).subscribe(r => (result = r));
      http.expectOne('/api/observations/1').flush(observation({ id: 1 }));
      expect(result!.etag).toBeNull();
    });

    it('patchObservation: PATCH mit If-Match, Content-Type application/merge-patch+json und Body unverändert (US13-2)', () => {
      let result = null as VersionedObservation | null;
      service.patchObservation(16503, { temperature: 9.6, reason: 'Ausreißer' }, '"3"').subscribe(r => (result = r));
      const req = http.expectOne('/api/observations/16503');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('If-Match')).toBe('"3"');
      expect(req.request.headers.get('Content-Type')).toBe(MERGE_PATCH_CONTENT_TYPE);
      expect(req.request.body).toEqual({ temperature: 9.6, reason: 'Ausreißer' });
      req.flush(observation({ temperature: 9.6, version: 4, correctedAt: '2026-11-19T13:20:00Z' }), { headers: { ETag: '"4"' } });
      expect(result!.etag).toBe('"4"');
      expect(result!.observation.version).toBe(4);
    });

    it('patchObservation: 412 kommt als Fehler mit apiError beim Aufrufer an (US13-4)', () => {
      let status = 0;
      service.patchObservation(16503, { temperature: 9.6, reason: 'Ausreißer' }, '"3"').subscribe({ error: e => (status = apiErrorOf(e).statusCode) });
      http.expectOne('/api/observations/16503').flush(
        apiErrorBody(412, 'PRECONDITION_FAILED', 'Die Stunde wurde inzwischen geändert.'), { status: 412, statusText: 'Precondition Failed' },
      );
      expect(status).toBe(412);
    });

    it('getCorrectionHistory: GET /api/observations/:id/corrections (US13-11)', () => {
      let count = -1;
      service.getCorrectionHistory(16503).subscribe(h => (count = h.items.length));
      http.expectOne('/api/observations/16503/corrections').flush({ items: [correction()] });
      expect(count).toBe(1);
    });

    it('reverseCorrection: POST …/corrections/:correctionId/reversal mit If-Match und { reason } (US13-16)', () => {
      let result = null as VersionedObservation | null;
      service.reverseCorrection(16503, 3, 'Rücknahme: Wert war plausibel', '"4"').subscribe(r => (result = r));
      const req = http.expectOne('/api/observations/16503/corrections/3/reversal');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('If-Match')).toBe('"4"');
      expect(req.request.body).toEqual({ reason: 'Rücknahme: Wert war plausibel' });
      req.flush(observation({ version: 5 }), { headers: { ETag: '"5"' } });
      expect(result!.etag).toBe('"5"');
    });

    it('getCorrections: GET /api/corrections?from&to&page&limit (US13-14)', () => {
      let total = -1;
      service.getCorrections({ from: '2026-11-19', to: '2026-11-19', page: 2, limit: 20 }).subscribe(l => (total = l.meta.total));
      http.expectOne('/api/corrections?from=2026-11-19&to=2026-11-19&page=2&limit=20')
        .flush({ items: [correction()], meta: { page: 2, limit: 20, total: 21 } });
      expect(total).toBe(21);

      service.getCorrections({ from: '2026-11-01', to: '2026-11-19' }).subscribe();
      http.expectOne('/api/corrections?from=2026-11-01&to=2026-11-19').flush({ items: [], meta: { page: 1, limit: 20, total: 0 } });
    });
  });
});
