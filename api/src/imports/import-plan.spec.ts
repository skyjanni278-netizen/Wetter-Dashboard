import { planHourlyRequests } from './import-plan';

describe('planHourlyRequests', () => {
  const today = '2026-11-20';

  it('ältere Tage nur aus dem Archiv, UTC-Abfrage beginnt einen Tag früher', () => {
    expect(planHourlyRequests('2026-10-01', '2026-10-03', today)).toEqual([
      {
        request: { source: 'archive', startDate: '2026-09-30', endDate: '2026-10-03' },
        fromLocal: '2026-10-01',
        toLocal: '2026-10-03',
      },
    ]);
  });

  it('die letzten 10 Tage aus der Forecast-API', () => {
    expect(planHourlyRequests('2026-11-15', '2026-11-20', today)).toEqual([
      {
        request: { source: 'forecast', startDate: '2026-11-14', endDate: '2026-11-20' },
        fromLocal: '2026-11-15',
        toLocal: '2026-11-20',
      },
    ]);
  });

  it('über die Grenze: zwei Abfragen ohne Überschneidung der Berliner Tage', () => {
    const plans = planHourlyRequests('2026-11-01', '2026-11-12', today);
    expect(plans.map(p => [p.request.source, p.fromLocal, p.toLocal])).toEqual([
      ['archive', '2026-11-01', '2026-11-09'],
      ['forecast', '2026-11-10', '2026-11-12'],
    ]);
  });

  it('from nach to → keine Abfrage (Prüfung mit 400 folgt in Schritt 4)', () => {
    expect(planHourlyRequests('2026-10-03', '2026-10-01', today)).toEqual([]);
  });
});
