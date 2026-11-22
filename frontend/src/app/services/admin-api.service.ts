import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { GapList, Health, ImportCreateRequest, ImportList, ImportResource, ImportsQuery } from '../models/api';

const API = '/api';

/**
 * Datenzugriff des Admin-Bereichs (03 B5.1, US10–US14). Ein HTTP-Aufruf je Endpunkt; das Token hängt
 * der `authInterceptor` an (alle Pfade außer `/api/health` verlangen die Rolle `admin`, 3a.16).
 * Fehler kommen unverändert (mit `apiError`) beim Aufrufer an.
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
}
