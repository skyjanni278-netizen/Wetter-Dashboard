import { rm } from 'node:fs/promises';
import { providerHours } from '../../test/support/fakes';
import { legacyHours, tempDir, writeLegacyDay } from '../../test/support/legacy-files';
import type { HourlyRequest } from '../weather-provider/open-meteo.client';
import { DST_CHECK_DATES, formatDstCheck, runDstCheck } from './legacy-dst-check';
import { legacyTimeToUtc } from './legacy-time';
import type { LegacyTimeRule } from './legacy-time';

/** Temperatur je UTC-Stunde (eindeutig je Stunde, damit ein Versatz auffällt). */
const tempAt = (timeUtc: string) => Number(timeUtc.slice(11, 13)) + Number(timeUtc.slice(8, 10)) / 100;

/** Archiv (`timezone=GMT`) für die angefragten UTC-Tage. */
const archive = {
  fetchHourly: jest.fn(async (req: HourlyRequest) =>
    providerHours(`${req.startDate}T00:00:00Z`, 48).map(h => ({ ...h, temperature: tempAt(h.timeUtc) })),
  ),
};

/** Altdatei, deren Ortszeiten nach `rule` geschrieben wurden. */
async function writeDay(dir: string, date: string, rule: LegacyTimeRule): Promise<void> {
  const hourly = legacyHours(date).map(h => {
    const utc = legacyTimeToUtc(h.time, rule);
    return { ...h, temperature: utc ? tempAt(utc) : 0 };
  });
  await writeLegacyDay(dir, date, { hourly });
}

describe('DST-Stichprobe (03 Z1, B2.7 Schritt 2)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempDir('wetter-dst-check-');
    archive.fetchHourly.mockClear();
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('Stichtage: 15.07.2025, 30.03.2025, 26.10.2025, 29.03.2026', () => {
    expect(DST_CHECK_DATES).toEqual(['2025-07-15', '2025-03-30', '2025-10-26', '2026-03-29']);
  });

  it('Altdateien mit festem Offset +01:00 → Regel fixed+01:00; je Tag eine Archivabfrage (UTC-Vortag bis Tag)', async () => {
    for (const date of DST_CHECK_DATES) await writeDay(dir, date, 'fixed+01:00');

    const result = await runDstCheck(dir, archive);

    expect(result.rule).toBe('fixed+01:00');
    expect(archive.fetchHourly).toHaveBeenCalledTimes(4);
    expect(archive.fetchHourly).toHaveBeenCalledWith({ source: 'archive', startDate: '2025-07-14', endDate: '2025-07-15' }, expect.anything());
    const july = result.days[0];
    expect(july.rules['fixed+01:00']).toMatchObject({ compared: 24, unmapped: 0, exact: 24, meanAbs: 0, matches: true });
    expect(july.rules['europe-berlin']).toMatchObject({ compared: 24, exact: 0, matches: false });
    // 29.03.2026: 02:00 gibt es in Europe/Berlin nicht.
    expect(result.days[3].rules['europe-berlin'].unmapped).toBe(1);
    expect(formatDstCheck(result).at(-1)).toBe('Regel: fixed+01:00 (passt an allen 4 Tagen, die andere Regel nicht)');
  });

  it('Altdatei in Berliner Ortszeit (Sommertag) → Regel europe-berlin', async () => {
    await writeDay(dir, '2025-07-15', 'europe-berlin');
    expect((await runDstCheck(dir, archive, ['2025-07-15'])).rule).toBe('europe-berlin');
  });

  it('nur ein Wintertag: beide Regeln passen → nicht eindeutig (null)', async () => {
    await writeDay(dir, '2025-01-15', 'fixed+01:00');
    const result = await runDstCheck(dir, archive, ['2025-01-15']);
    expect(result.rule).toBeNull();
    expect(formatDstCheck(result).at(-1)).toMatch(/nicht eindeutig/);
  });
});
