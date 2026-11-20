import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DayData, MonthResponse, YearResponse, DayForecast, Stats } from '../models/weather';
import { Location, Status } from '../models/api';

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

  getToday(): Observable<DayData> {
    return this.http.get<DayData>(`${API}/data/today`);
  }

  getDay(date: string): Observable<DayData> {
    return this.http.get<DayData>(`${API}/data/day/${date}`);
  }

  getMonth(year: string, month: string): Observable<MonthResponse> {
    return this.http.get<MonthResponse>(`${API}/data/month/${year}/${month}`);
  }

  getYear(year: string): Observable<YearResponse> {
    return this.http.get<YearResponse>(`${API}/data/year/${year}`);
  }

  getForecast(): Observable<DayForecast[]> {
    return this.http.get<DayForecast[]>(`${API}/forecast`);
  }

  getStats(): Observable<Stats> {
    return this.http.get<Stats>(`${API}/stats`);
  }
}
