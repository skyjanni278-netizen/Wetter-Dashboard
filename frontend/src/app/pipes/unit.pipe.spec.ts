import { TestBed } from '@angular/core/testing';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { UnitPipe } from './unit.pipe';

registerLocaleData(localeDe);

describe('UnitPipe (V11)', () => {
  let p: UnitPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UnitPipe, { provide: LOCALE_ID, useValue: 'de-DE' }],
    });
    p = TestBed.inject(UnitPipe);
  });

  it('setzt Dezimalkomma und schmales geschütztes Leerzeichen', () => {
    expect(p.transform(9.7, '°C', '1.0-1')).toBe('9,7 °C');
  });

  it('beachtet die Nachkommastellen', () => {
    expect(p.transform(12.34, 'mm', '1.1-1')).toBe('12,3 mm');
    expect(p.transform(14.6, 'km/h', '1.0-0')).toBe('15 km/h');
  });

  it('null und undefined ergeben „–“', () => {
    expect(p.transform(null, '°C')).toBe('–');
    expect(p.transform(undefined, '°C')).toBe('–');
  });
});
