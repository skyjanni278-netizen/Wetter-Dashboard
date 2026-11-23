import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import type {
  CorrectionHistory, CorrectionList, CorrectionsQuery, GapList, Health, ImportCreateRequest, ImportList, ImportResource,
  ImportsQuery, ObservationPatch, ObservationResource, VersionedObservation,
} from '../models/api';

const API = '/api';

/** Content-Type des PATCH (03 B3.4, JSON Merge Patch nach RFC 7396). */
export const MERGE_PATCH_CONTENT_TYPE = 'application/merge-patch+json';

/** Stunde und `ETag`-Header einer Antwort von GET, PATCH oder Rücknahme. */
function versioned(response: HttpResponse<ObservationResource>): VersionedObservation {
  return { observation: response.body as ObservationResource, etag: response.headers.get('ETag') };
}

/**
 * Datenzugriff des Admin-Bereichs (03 B5.1, US10–US14). Ein HTTP-Aufruf je Endpunkt; das Token hängt
 * der `authInterceptor` an (alle Pfade außer `/api/health` und `GET /api/observations/:id` verlangen die
 * Rolle `admin`, 3a.16). Fehler kommen unverändert (mit `apiError`) beim Aufrufer an.
 *
 * Korrekturen (US13, B3.4): `getObservation` liest den Header `ETag` (`observe: 'response'`), PATCH und
 * Rücknahme schicken ihn als `If-Match` zurück und liefern den neuen `ETag`. Der Dev-Proxy und die gleiche
 * Origin lassen den Header durch (kein CORS, kein `Access-Control-Expose-Headers` nötig).
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private http = inject(HttpClient);

  /** `GET /api/imports?status&kind&page&limit` (US11-2); nur gesetzte Parameter gehen mit. */
  getImports(query: ImportsQuery = {}): Observable<ImportList> {
    let params = new HttpParams();
    for (const key of ['status', 'kind', 'page', 'limit'] as const) {
      const value = query[key];
      if (value !== undefined) params = params.set(key, String(value));
    }
    return this.http.get<ImportList>(`${API}/imports`, { params });
  }

  /** `GET /api/imports/:id` (US11-1, Polling der Detailseite). */
  getImport(id: number): Observable<ImportResource> {
    return this.http.get<ImportResource>(`${API}/imports/${id}`);
  }

  /** `POST /api/imports` (US10-3): 202 mit dem Import im Status `queued`; 409 `IMPORT_RUNNING`, 400 am Feld. */
  createImport(request: ImportCreateRequest): Observable<ImportResource> {
    return this.http.post<ImportResource>(`${API}/imports`, request);
  }

  /** `GET /api/gaps?from&to` (US12-1): Lücken der abgeschlossenen Stunden, aufsteigend. */
  getGaps(from: string, to: string): Observable<GapList> {
    return this.http.get<GapList>(`${API}/gaps`, { params: { from, to } });
  }

  /** `GET /api/health` (US14-3, öffentlich): 200 bei lesbarer DB, sonst 503. */
  getHealth(): Observable<Health> {
    return this.http.get<Health>(`${API}/health`);
  }

  /** `GET /api/observations/:id` (US13-1): Stunde mit Version und `ETag` für `If-Match`. */
  getObservation(id: number): Observable<VersionedObservation> {
    return this.http.get<ObservationResource>(`${API}/observations/${id}`, { observe: 'response' }).pipe(map(versioned));
  }

  /**
   * `PATCH /api/observations/:id` (US13-2): nur geänderte Felder und `reason`, `If-Match` = ETag aus
   * `getObservation`. 412 = inzwischen geändert, 409 = Vorhersage, 400 = Feldfehler, 428 = ohne ETag.
   */
  patchObservation(id: number, patch: ObservationPatch, etag: string): Observable<VersionedObservation> {
    const headers = new HttpHeaders({ 'Content-Type': MERGE_PATCH_CONTENT_TYPE, 'If-Match': etag });
    return this.http
      .patch<ObservationResource>(`${API}/observations/${id}`, patch, { headers, observe: 'response' })
      .pipe(map(versioned));
  }

  /** `GET /api/observations/:id/corrections` (US13-11): Historie einer Stunde, neueste zuerst. */
  getCorrectionHistory(id: number): Observable<CorrectionHistory> {
    return this.http.get<CorrectionHistory>(`${API}/observations/${id}/corrections`);
  }

  /**
   * `POST /api/observations/:id/corrections/:correctionId/reversal` (US13-16, R33) mit `If-Match` und
   * `{ reason }`. 409 `CORRECTION_NOT_REVERSIBLE`, 412 = inzwischen geändert.
   */
  reverseCorrection(id: number, correctionId: number, reason: string, etag: string): Observable<VersionedObservation> {
    const headers = new HttpHeaders({ 'If-Match': etag });
    return this.http
      .post<ObservationResource>(`${API}/observations/${id}/corrections/${correctionId}/reversal`, { reason }, {
        headers, observe: 'response',
      })
      .pipe(map(versioned));
  }

  /** `GET /api/corrections?from&to&page&limit` (US13-14): Übersicht, neueste zuerst. */
  getCorrections(query: CorrectionsQuery): Observable<CorrectionList> {
    let params = new HttpParams().set('from', query.from).set('to', query.to);
    if (query.page !== undefined) params = params.set('page', String(query.page));
    if (query.limit !== undefined) params = params.set('limit', String(query.limit));
    return this.http.get<CorrectionList>(`${API}/corrections`, { params });
  }
}
