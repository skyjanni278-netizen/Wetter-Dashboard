import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { MonthlyPageComponent } from './monthly-page';
import { WeatherService } from '../../services/weather.service';
import { MonthResponse } from '../../models/weather';
import { berlinToday } from '../../utils/berlin-date';

function response(year: string, month: string, avgTemp: number): MonthResponse {
  return { year, month, data: [{ day: 1, avgTemp, totalPrecip: 1 }, { day: 2, avgTemp, totalPrecip: 2 }] };
}

function create(getMonth: (year: string, month: string) => Observable<MonthResponse>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: { getMonth } }],
  });
  const fixture = TestBed.createComponent(MonthlyPageComponent);
  fixture.detectChanges();
  return fixture;
}

describe('MonthlyPageComponent', () => {
  it('Vorbelegung ist der aktuelle Berliner Monat, die Auswahl zeigt ihn an (V01, F02)', () => {
    const calls: string[] = [];
    const fixture = create((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); });
    const c = fixture.componentInstance;
    const today = berlinToday();
    expect(c.selectedYear()).toBe(today.slice(0, 4));
    expect(c.selectedMonth()).toBe(today.slice(5, 7));
    expect(calls).toEqual([`${today.slice(0, 4)}/${today.slice(5, 7)}`]);

    const [yearSelect, monthSelect] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('select'));
    expect(yearSelect.value).toBe(today.slice(0, 4));
    expect(monthSelect.value).toBe(today.slice(5, 7));
  });

  it('Jahreswechsel lädt den sichtbaren Monat, die Monatsauswahl bleibt stehen (V01)', () => {
    const calls: string[] = [];
    const fixture = create((y, m) => { calls.push(`${y}/${m}`); return of(response(y, m, 5)); });
    const c = fixture.componentInstance;
    const month = c.selectedMonth();
    const el = fixture.nativeElement as HTMLElement;
    const [yearSelect, monthSelect] = Array.from(el.querySelectorAll('select'));

    yearSelect.value = c.years[1];
    yearSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(calls.at(-1)).toBe(`${c.years[1]}/${month}`);
    expect(yearSelect.value).toBe(c.years[1]);
    expect(monthSelect.value).toBe(month);
  });

  it('Fehler nach Erfolg setzt die Daten auf null (V02, F12)', () => {
    const fixture = create((y, m) => y === '2025' && m === '03'
      ? throwError(() => ({ status: 500 }))
      : of(response(y, m, 5)));
    const c = fixture.componentInstance;
    expect(c.state()).toBe('success');
    expect(c.monthData()?.length).toBe(2);

    c.selectedYear.set('2025');
    c.selectedMonth.set('03');
    fixture.detectChanges();
    expect(c.state()).toBe('error');
    expect(c.monthData()).toBeNull();
    expect(c.chartData()).toBeNull();
    expect(c.error()).toBe('Fehler beim Laden der Monatsdaten.');
    expect((fixture.nativeElement as HTMLElement).querySelector('.summary-row')).toBeNull();
  });

  it('leere Antwort ergibt empty und Daten null', () => {
    const fixture = create((y, m) => y === '2025'
      ? of({ year: y, month: m, data: [] })
      : of(response(y, m, 5)));
    const c = fixture.componentInstance;
    c.selectedYear.set('2025');
    fixture.detectChanges();
    expect(c.state()).toBe('empty');
    expect(c.monthData()).toBeNull();
    expect(c.error()).toBe('Keine gespeicherten Daten für diesen Monat.');
  });

  it('Race: zwei schnelle Wechsel, nur der letzte Wert wird übernommen (V03, F04)', () => {
    const requests = new Map<string, Subject<MonthResponse>>();
    const fixture = create((y, m) => {
      const s = new Subject<MonthResponse>();
      requests.set(`${y}/${m}`, s);
      return s;
    });
    const c = fixture.componentInstance;

    c.selectedYear.set('2025');
    c.selectedMonth.set('01');
    fixture.detectChanges();
    c.selectedMonth.set('02');
    fixture.detectChanges();

    requests.get('2025/02')!.next(response('2025', '02', 2));
    requests.get('2025/01')!.next(response('2025', '01', 1));
    fixture.detectChanges();

    expect(c.state()).toBe('success');
    expect(c.monthData()?.[0].avgTemp).toBe(2);
    expect(requests.get('2025/01')!.observed).toBe(false);
  });

  it('„Laden“ lädt dieselbe Auswahl erneut', () => {
    let count = 0;
    const fixture = create((y, m) => { count++; return of(response(y, m, 5)); });
    fixture.componentInstance.loadData();
    fixture.detectChanges();
    expect(count).toBe(2);
  });
});
