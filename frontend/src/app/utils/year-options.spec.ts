import { yearOptions } from './year-options';
import { YearList } from '../models/api';

const LIST: YearList = {
  items: [
    { id: '2025', year: 2025, complete: true, daysComplete: 365 },
    { id: '2026', year: 2026, complete: false, daysComplete: 322 },
  ],
};

describe('yearOptions (F20)', () => {
  it('Jahre aus /api/summaries/years, neuestes zuerst', () => {
    expect(yearOptions(LIST, '2025', '2026-11-19')).toEqual(['2026', '2025']);
  });

  it('nur die Jahre der API, nicht DATA_START bis heute', () => {
    expect(yearOptions({ items: [LIST.items[1]] }, '2026', '2027-03-01')).toEqual(['2026']);
  });

  it('gültiges gewähltes Jahr ohne Daten kommt dazu (Feld zeigt dasselbe Jahr wie die Seite)', () => {
    expect(yearOptions(LIST, '2027', '2027-01-01')).toEqual(['2027', '2026', '2025']);
    expect(yearOptions({ items: [] }, '2025', '2026-11-19')).toEqual(['2025']);
  });

  it('ohne Liste (lädt oder Fehler): Übergang von DATA_START bis zum aktuellen Jahr', () => {
    expect(yearOptions(null, null, '2027-05-01')).toEqual(['2027', '2026', '2025']);
  });
});
