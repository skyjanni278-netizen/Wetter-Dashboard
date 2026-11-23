import {
  adminViewTitle, correctionDayTitle, dayViewTitle, fullTitle, importDetailTitle, longDateLabel, monthLabel, monthViewTitle, viewTitle,
  yearViewTitle,
} from './page-title';

describe('page-title (V10)', () => {
  it('Monat: „November 2026 – Monat – Wetter Heubach“', () => {
    expect(fullTitle(viewTitle('Monat', monthLabel('2026', '11')))).toBe('November 2026 – Monat – Wetter Heubach');
  });

  it('Heute: „19. November 2026 – Heute – Wetter Heubach“', () => {
    expect(fullTitle(viewTitle('Heute', longDateLabel('2026-11-19')))).toBe('19. November 2026 – Heute – Wetter Heubach');
  });

  it('Jahr und Rekorde', () => {
    expect(fullTitle(viewTitle('Jahr', '2026'))).toBe('2026 – Jahr – Wetter Heubach');
    expect(fullTitle(viewTitle('Rekorde'))).toBe('Rekorde – Wetter Heubach');
  });

  it('ohne Titel bleibt der Seitenname', () => {
    expect(fullTitle('')).toBe('Wetter Heubach');
  });

  it('ungültiges oder leeres Datum ergibt kein „NaN. undefined“ (Befund 0.3)', () => {
    expect(longDateLabel('')).toBe('');
    expect(longDateLabel('abc')).toBe('');
    expect(longDateLabel('2026-02-30')).toBe('');
    expect(fullTitle(viewTitle('Heute', longDateLabel('')))).toBe('Heute – Wetter Heubach');
    expect(monthLabel('2025', '13')).toBe('');
  });

  it('Ansichtstitel aus Route-Parametern, ungültig ergibt einen Hinweis (V08)', () => {
    expect(fullTitle(dayViewTitle('2026-11-10'))).toBe('10. November 2026 – Heute – Wetter Heubach');
    expect(fullTitle(dayViewTitle('2026-02-30'))).toBe('Ungültiges Datum – Wetter Heubach');
    expect(fullTitle(dayViewTitle(''))).toBe('Ungültiges Datum – Wetter Heubach');
    expect(fullTitle(monthViewTitle('2025', '03'))).toBe('März 2025 – Monat – Wetter Heubach');
    expect(fullTitle(monthViewTitle('2025', '13'))).toBe('Ungültiger Monat – Wetter Heubach');
    expect(fullTitle(yearViewTitle('2025'))).toBe('2025 – Jahr – Wetter Heubach');
    expect(fullTitle(yearViewTitle('1999'))).toBe('Ungültiges Jahr – Wetter Heubach');
  });

  it('Admin: „Importe – Admin“, Detail „Import #12 – Admin“, ungültige Nummer „Ungültiger Import – Admin“', () => {
    expect(fullTitle(adminViewTitle('Importe'))).toBe('Importe – Admin – Wetter Heubach');
    expect(adminViewTitle('Status')).toBe('Status – Admin');
    expect(importDetailTitle('12')).toBe('Import #12 – Admin');
    expect(importDetailTitle('0')).toBe('Ungültiger Import – Admin');
    expect(importDetailTitle(null)).toBe('Ungültiger Import – Admin');
    expect(correctionDayTitle('2026-11-19')).toBe('Korrektur 19.11.2026 – Admin');
    expect(correctionDayTitle('2026-02-30')).toBe('Ungültiges Datum – Admin');
  });
});
