import { fullTitle, longDateLabel, monthLabel, viewTitle } from './page-title';

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
});
