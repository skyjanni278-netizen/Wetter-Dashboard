import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TodayPageComponent } from './today-page';
import { WeatherService } from '../../services/weather.service';
import { DayData, HourlyEntry } from '../../models/weather';

function hour(h: number, temperature: number | null): HourlyEntry {
  return {
    time: `2026-11-10T${String(h).padStart(2, '0')}:00`,
    temperature: temperature as number,
    apparentTemperature: 0,
    precipitation: 0,
    weathercode: 0,
    windspeed: 0,
    winddirection: 0,
  };
}

function setup(day: DayData) {
  const weatherMock = {
    getToday: () => of(day),
    getDay: () => of(day),
    getForecast: () => of([]),
  };
  TestBed.configureTestingModule({
    providers: [{ provide: WeatherService, useValue: weatherMock }],
  });
  const fixture = TestBed.createComponent(TodayPageComponent);
  fixture.detectChanges();
  return fixture.componentInstance;
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
