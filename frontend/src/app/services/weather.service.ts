import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Day, DayList, ForecastList, Location, MonthSummary, MonthSummaryList, PeriodSummary, Records, Status, YearList,
  YearSummary,
} from '../models/api';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private http = inject(HttpClient);

  /** Neue API (Nest, Proxy an :3000): Datenstand ohne Fehlertext. */
  getStatus(): Observable<Status> {
    return this.http.get<Status>(`${API}/status`);
  }

  /** Neue API (Nest, Proxy an :3000): ein Standort. */
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

  /**
   * Neue API (Nest): Tage `from` bis `to` (`YYYY-MM-DD`), nur Tage mit Daten, aufsteigend (US04-2).
   * `to` darf nicht nach heute liegen (400 `DATE_IN_FUTURE`, US04-9).
   */
  getDays(from: string, to: string): Observable<DayList> {
    return this.http.get<DayList>(`${API}/days`, { params: { from, to } });
  }

  /** Neue API (Nest): 7-Tage-Vorschau (US03); ohne Vorhersage `items = []`. */
  getForecasts(): Observable<ForecastList> {
    return this.http.get<ForecastList>(`${API}/forecasts`);
  }

  /** Neue API (Nest): Rekorde ohne Vorhersagestunden (US06). */
  getRecords(): Observable<Records> {
    return this.http.get<Records>(`${API}/records`);
  }

  /** Neue API (Nest): Zusammenfassung eines Monats `YYYY-MM` (US04); ohne Daten 404 `NO_DATA`. */
  getMonthSummary(yearMonth: string): Observable<MonthSummary> {
    return this.http.get<MonthSummary>(`${API}/summaries/months/${yearMonth}`);
  }

  /** Neue API (Nest): alle Monate eines Jahres mit Daten, aufsteigend (US05-2). */
  getMonthSummaries(year: string): Observable<MonthSummaryList> {
    return this.http.get<MonthSummaryList>(`${API}/summaries/months`, { params: { year } });
  }

  /** Neue API (Nest): Zusammenfassung eines Jahres `YYYY` (US05); ohne Daten 404 `NO_DATA`. */
  getYearSummary(year: string): Observable<YearSummary> {
    return this.http.get<YearSummary>(`${API}/summaries/years/${year}`);
  }

  /**
   * Neue API (Nest, seit 12b): Zusammenfassung eines freien Zeitraums `from` bis `to` (`YYYY-MM-DD`, ≤ 366 Tage,
   * R28) für den Vorjahresvergleich (R29); `to` nach heute → 400 `DATE_IN_FUTURE`, ohne Daten 404 `NO_DATA`.
   */
  getPeriod(from: string, to: string): Observable<PeriodSummary> {
    return this.http.get<PeriodSummary>(`${API}/summaries/periods`, { params: { from, to } });
  }

  /** Neue API (Nest): Jahre mit Daten für die Jahresauswahl, aufsteigend (US04-8, F20). */
  getYearList(): Observable<YearList> {
    return this.http.get<YearList>(`${API}/summaries/years`);
  }
}
