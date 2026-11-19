import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { TodayPageComponent } from './today-page';
import { WeatherService } from '../../services/weather.service';
import { DayData, HourlyEntry } from '../../models/weather';

function hour(h: number, temperature: number | null, date = '2026-11-10'): HourlyEntry {
  return {
    time: `${date}T${String(h).padStart(2, '0')}:00`,
    temperature: temperature as number,
    apparentTemperature: 0,
    precipitation: 0,
    weathercode: 0,
    windspeed: 0,
    winddirection: 0,
  };
}

function day(date: string, temperature: number): DayData {
  return { date, location: 'Heubach', hourly: [hour(0, temperature, date), hour(12, temperature, date)] };
}

interface Mock {
  getToday: () => Observable<DayData>;
  getDay: (date: string) => Observable<DayData>;
  getForecast: () => Observable<never[]>;
}

function create(mock: Mock) {
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: mock }],
  });
  const fixture = TestBed.createComponent(TodayPageComponent);
  fixture.detectChanges();
  return fixture;
}

function setup(data: DayData) {
  return create({
    getToday: () => of(data),
    getDay: () => of(data),
    getForecast: () => of([]),
  }).componentInstance;
}

describe('TodayPageComponent Min/Max (Ist-Verhalten)', () => {
  it('Tag ohne null-Werte ergibt korrektes Min/Max', () => {
    const c = setup({ date: '2026-11-10', location: 'Heubach', hourly: [hour(0, 3), hour(12, 9.5), hour(18, -1)] });
    expect(c.dayMinTemp()).toBe(-1);
    expect(c.dayMaxTemp()).toBe(9.5);
    expect(c.dayTempRange()).toBe(10.5);
  });

  it('null-Temperatur in einer Stunde ergibt Min/Max 0', () => {
    // IST-Verhalten, wird in Schritt 7 geändert (F15): Math.min/max behandelt null als 0
    const c = setup({ date: '2026-11-10', location: 'Heubach', hourly: [hour(0, 3), hour(12, null), hour(18, 5)] });
    expect(c.dayMinTemp()).toBe(0);
    expect(c.dayMaxTemp()).toBe(5);
  });
});

describe('TodayPageComponent Zustandsmodell (V02)', () => {
  it('Fehler nach Erfolg setzt die Daten auf null (F03)', () => {
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10'
        ? of(day('2026-11-10', 7))
        : throwError(() => ({ status: 500, error: { error: 'Serverfehler' } })),
      getForecast: () => of([]),
    });
    const c = fixture.componentInstance;

    c.selectedDate.set('2026-11-10');
    fixture.detectChanges();
    expect(c.state()).toBe('success');
    expect(c.dayData()?.date).toBe('2026-11-10');

    c.selectedDate.set('2024-12-31');
    fixture.detectChanges();
    expect(c.state()).toBe('error');
    expect(c.dayData()).toBeNull();
    expect(c.error()).toBe('Serverfehler');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')?.textContent).toContain('Serverfehler');
    expect(el.querySelector('.hero-card')).toBeNull();
    expect(el.querySelector('.summary-grid')).toBeNull();
  });

  it('404 nach Erfolg ergibt empty und Daten null', () => {
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10'
        ? of(day('2026-11-10', 7))
        : throwError(() => ({ status: 404, error: { error: 'Keine Daten für 2024-12-31 gefunden.' } })),
      getForecast: () => of([]),
    });
    const c = fixture.componentInstance;

    c.selectedDate.set('2026-11-10');
    fixture.detectChanges();
    c.selectedDate.set('2024-12-31');
    fixture.detectChanges();
    expect(c.state()).toBe('empty');
    expect(c.dayData()).toBeNull();
    expect(c.error()).toBe('Keine Daten für 2024-12-31 gefunden.');
  });

  it('beim Laden bleiben alte Daten sichtbar, der Inhaltsbereich trägt aria-busy', () => {
    const pending = new Subject<DayData>();
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => date === '2026-11-10' ? of(day('2026-11-10', 7)) : pending,
      getForecast: () => of([]),
    });
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;

    c.selectedDate.set('2026-11-10');
    fixture.detectChanges();
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();

    c.selectedDate.set('2026-11-11');
    fixture.detectChanges();
    expect(c.state()).toBe('loading');
    expect(c.dayData()?.date).toBe('2026-11-10');
    const busy = el.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.querySelector('.hero-card')).not.toBeNull();
    expect(el.querySelector('.loading')).not.toBeNull();

    pending.next(day('2026-11-11', 8));
    fixture.detectChanges();
    expect(c.state()).toBe('success');
    expect(c.dayData()?.date).toBe('2026-11-11');
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('TodayPageComponent Race (V03, F04)', () => {
  function raceSetup() {
    const requests = new Map<string, Subject<DayData>>();
    const fixture = create({
      getToday: () => of(day('2026-11-19', 5)),
      getDay: (date: string) => {
        const s = new Subject<DayData>();
        requests.set(date, s);
        return s;
      },
      getForecast: () => of([]),
    });
    return { fixture, c: fixture.componentInstance, requests };
  }

  it('zwei schnelle Wechsel: nur der zuletzt gewählte Tag wird übernommen', () => {
    const { fixture, c, requests } = raceSetup();

    c.selectedDate.set('2026-11-13');
    fixture.detectChanges();
    c.selectedDate.set('2026-11-12');
    fixture.detectChanges();

    // Antwort für den letzten Wechsel kommt zuerst, die überholte danach
    requests.get('2026-11-12')!.next(day('2026-11-12', 2));
    requests.get('2026-11-13')!.next(day('2026-11-13', 3));
    fixture.detectChanges();

    expect(c.selectedDate()).toBe('2026-11-12');
    expect(c.dayData()?.date).toBe('2026-11-12');
    expect(requests.get('2026-11-13')!.observed).toBe(false);
  });

  it('überholte Antwort vor der aktuellen wird verworfen', () => {
    const { fixture, c, requests } = raceSetup();

    c.selectedDate.set('2026-11-13');
    fixture.detectChanges();
    c.selectedDate.set('2026-11-12');
    fixture.detectChanges();

    requests.get('2026-11-13')!.next(day('2026-11-13', 3));
    fixture.detectChanges();
    expect(c.state()).toBe('loading');
    expect(c.dayData()?.date).toBe('2026-11-19');

    requests.get('2026-11-12')!.next(day('2026-11-12', 2));
    fixture.detectChanges();
    expect(c.state()).toBe('success');
    expect(c.dayData()?.date).toBe('2026-11-12');
  });
});
