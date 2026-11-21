import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MonthResponse, YearResponse } from '../models/weather';
import { Day, ForecastList, Location, Records, Status } from '../models/api';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private http = inject(HttpClient);

  /** Neue API (Nest, Proxy an :3001): Datenstand ohne Fehlertext. */
  getStatus(): Observable<Status> {
    return this.http.get<Status>(`${API}/status`);
  }

  /** Neue API (Nest, Proxy an :3001): ein Standort. */
  getLocation(id: number): Observable<Location> {
    return this.http.get<Location>(`${API}/locations/${id}`);
  }

  /** Neue API (Nest): der heutige Berliner Tag laut Server (US01). */
  getToday(): Observable<Day> {
    return this.http.get<Day>(`${API}/days/today`);
  }

  /** Neue API (Nest): ein Tag `YYYY-MM-DD` (US02). */
  getDay(date: string): Observable<Day> {
    return this.http.get<Day>(`${API}/days/${date}`);
  }

  /** Neue API (Nest): 7-Tage-Vorschau (US03); ohne Vorhersage `items = []`. */
  getForecasts(): Observable<ForecastList> {
    return this.http.get<ForecastList>(`${API}/forecasts`);
  }

  /** Neue API (Nest): Rekorde ohne Vorhersagestunden (US06). */
  getRecords(): Observable<Records> {
    return this.http.get<Records>(`${API}/records`);
  }

  /** Express (bis Schritt 8). */
  getMonth(year: string, month: string): Observable<MonthResponse> {
    return this.http.get<MonthResponse>(`${API}/data/month/${year}/${month}`);
  }

  /** Express (bis Schritt 8). */
  getYear(year: string): Observable<YearResponse> {
    return this.http.get<YearResponse>(`${API}/data/year/${year}`);
  }
}
