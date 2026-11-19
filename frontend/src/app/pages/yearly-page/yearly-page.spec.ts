import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { YearlyPageComponent } from './yearly-page';
import { WeatherService } from '../../services/weather.service';
import { YearResponse } from '../../models/weather';
import { berlinToday } from '../../utils/berlin-date';

function response(year: string, avgTemp: number): YearResponse {
  return { year, data: [{ month: 1, avgTemp, totalPrecip: 10 }, { month: 2, avgTemp: avgTemp + 1, totalPrecip: 20 }] };
}

function create(getYear: (year: string) => Observable<YearResponse>) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: { getYear } }],
  });
  const fixture = TestBed.createComponent(YearlyPageComponent);
  fixture.detectChanges();
  return fixture;
}

describe('YearlyPageComponent', () => {
  it('Vorbelegung ist das aktuelle Berliner Jahr, die Auswahl zeigt es an (V01)', () => {
    const fixture = create(y => of(response(y, 5)));
    const year = berlinToday().slice(0, 4);
    expect(fixture.componentInstance.selectedYear()).toBe(year);
    expect((fixture.nativeElement as HTMLElement).querySelector('select')!.value).toBe(year);
  });

  it('Fehler nach Erfolg setzt die Daten auf null (V02, F12)', () => {
    const fixture = create(y => y === '2024' ? throwError(() => ({ status: 500 })) : of(response(y, 5)));
    const c = fixture.componentInstance;
    expect(c.state()).toBe('success');
    expect(c.yearData()?.length).toBe(2);

    c.selectedYear.set('2024');
    fixture.detectChanges();
    expect(c.state()).toBe('error');
    expect(c.yearData()).toBeNull();
    expect(c.chartData()).toBeNull();
    expect(c.maxTemp()).toBeNull();
    expect(c.error()).toBe('Fehler beim Laden der Jahresdaten.');
    expect((fixture.nativeElement as HTMLElement).querySelector('.summary-row')).toBeNull();
  });

  it('leere Antwort ergibt empty und Daten null', () => {
    const fixture = create(y => y === '2024' ? of({ year: y, data: [] }) : of(response(y, 5)));
    const c = fixture.componentInstance;
    c.selectedYear.set('2024');
    fixture.detectChanges();
    expect(c.state()).toBe('empty');
    expect(c.yearData()).toBeNull();
    expect(c.error()).toBe('Keine gespeicherten Daten für dieses Jahr.');
  });

  it('Race: zwei schnelle Wechsel, nur der letzte Wert wird übernommen (V03, F04)', () => {
    const requests = new Map<string, Subject<YearResponse>>();
    const fixture = create(y => {
      const s = new Subject<YearResponse>();
      requests.set(y, s);
      return s;
    });
    const c = fixture.componentInstance;

    c.selectedYear.set('2025');
    fixture.detectChanges();
    c.selectedYear.set('2024');
    fixture.detectChanges();

    requests.get('2024')!.next(response('2024', 4));
    requests.get('2025')!.next(response('2025', 9));
    fixture.detectChanges();

    expect(c.state()).toBe('success');
    expect(c.yearData()?.[0].avgTemp).toBe(4);
    expect(requests.get('2025')!.observed).toBe(false);
  });
});
