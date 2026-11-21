import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { ApiException } from '../common/api.exception';
import { ApiValidationException } from '../common/api-validation.exception';
import { Clock, FixedClock } from '../common/clock';
import type { ObservationHour, StoredDay } from '../observations/observation';
import { OBSERVATION_STORE } from '../observations/observation.store';
import { AggregationService } from '../stats/aggregation.service';
import type { ObservationStore } from '../observations/observation.store';
import { DaysController } from './days.controller';
import { DaysService } from './days.service';

function hour(timeLocal: string, temperature: number | null): ObservationHour {
  return {
    timeLocal,
    timeUtc: null,
    temperature,
    apparentTemperature: 1.25,
    precipitation: 0.04,
    weatherCode: 3,
    windSpeed: 12.34,
    windDirection: 220,
    source: null,
  };
}

/** Fake-Store ohne Dateien: Der Controller-Test braucht dank DI keinen Datenordner. */
class FakeObservationStore implements ObservationStore {
  readonly days = new Map<string, ObservationHour[]>([
    ['2026-11-10', Array.from({ length: 24 }, (_, h) => hour(`2026-11-10T${String(h).padStart(2, '0')}:00`, h === 5 ? null : 5 + h / 10))],
    ['2026-11-20', [hour('2026-11-20T00:00', 4.44)]],
  ]);

  async getDay(date: string): Promise<ObservationHour[] | null> {
    return this.days.get(date) ?? null;
  }

  async getRange(from: string, to: string): Promise<StoredDay[]> {
    return [...this.days.entries()]
      .filter(([date]) => date >= from && date <= to)
      .map(([date, hours]) => ({ date, hours }));
  }

  async getDataRange() {
    return { from: '2026-11-10', to: '2026-11-20' };
  }

  async getRevision(): Promise<null> {
    return null;
  }

  async upsertHours(): Promise<never> {
    throw new Error('nicht benötigt');
  }
}

describe('DaysService und DaysController mit Fake-Store (DI, ohne Dateien)', () => {
  let service: DaysService;
  let controller: DaysController;
  const clock = new FixedClock('2026-11-19T23:30:00Z'); // 00:30 MEZ am 20.11.

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DaysController],
      providers: [
        DaysService,
        AggregationService,
        { provide: OBSERVATION_STORE, useClass: FakeObservationStore },
        { provide: Clock, useValue: clock },
      ],
    }).compile();
    service = moduleRef.get(DaysService);
    controller = moduleRef.get(DaysController);
  });

  it('findOne liefert den Tag in der Form aus B2.2, Stundenwerte ungerundet, null bleibt null', async () => {
    const day = await service.findOne('2026-11-10');
    expect(day).toMatchObject({
      id: '2026-11-10',
      date: '2026-11-10',
      locationId: 1,
      timezone: 'Europe/Berlin',
      isToday: false,
      hoursExpected: 24,
      hoursObserved: 24,
      hoursPredicted: 0,
      complete: false, // R14: Stunde 5 ohne Temperatur
      current: null,
      observed: {
        temperature: { mean: 6.2, min: 5, max: 7.3, minAt: '2026-11-10T00:00', maxAt: '2026-11-10T23:00' },
        precipitationSum: 1,
        isDryDay: null,
      },
      predicted: { temperature: { min: null, max: null }, precipitationSum: null },
    });
    expect(day.hours).toHaveLength(24);
    expect(day.hours[0]).toEqual({
      timeLocal: '2026-11-10T00:00',
      temperature: 5,
      apparentTemperature: 1.25,
      precipitation: 0.04,
      weatherCode: 3,
      windSpeed: 12.34,
      windDirection: 220,
      source: null,
      isPrediction: false,
      correctedAt: null,
    });
    expect(day.hours[5].temperature).toBeNull();
    expect(day.hours[0]).not.toHaveProperty('timeUtc');
  });

  it('heute ist der Berliner Tag aus der Clock (00:30 MEZ → 20.11.)', async () => {
    const day = await service.findToday();
    expect(day.date).toBe('2026-11-20');
    expect(day.isToday).toBe(true);
  });

  it('R03 (US02-5): Tag vor dem Datenbeginn → 404 NO_DATA, dataFrom aus dem Store, Meldung nennt ihn', async () => {
    const result = service.findOne('2024-12-31');
    await expect(result).rejects.toBeInstanceOf(ApiException);
    await expect(result).rejects.toMatchObject({
      response: {
        statusCode: 404,
        error: 'Not Found',
        code: 'NO_DATA',
        message: 'Für den 31.12.2024 liegen keine Daten vor. Daten gibt es ab 10.11.2026.',
        errors: [],
        details: { dataFrom: '2026-11-10' },
      },
    });
  });

  it('R03: Tag nach dem Datenbeginn ohne Stunde → ebenfalls 404 NO_DATA', async () => {
    await expect(service.findOne('2026-11-15')).rejects.toMatchObject({
      response: { statusCode: 404, code: 'NO_DATA', details: { dataFrom: '2026-11-10' } },
    });
  });

  describe('R02 (US02-4): Zukunftssperre über die Clock, Mitternacht MEZ', () => {
    afterEach(() => clock.set('2026-11-19T23:30:00Z'));

    it('23:59:59 MEZ am 19.11.: der 20.11. ist morgen → 400 DATE_IN_FUTURE am Feld date', async () => {
      clock.set('2026-11-19T22:59:59Z');
      const result = service.findOne('2026-11-20');
      await expect(result).rejects.toBeInstanceOf(ApiValidationException);
      await expect(result).rejects.toMatchObject({
        response: {
          statusCode: 400,
          code: 'DATE_IN_FUTURE',
          errors: [{ field: 'date', code: 'too_big', message: expect.stringContaining('19.11.2026') }],
          details: null,
        },
      });
    });

    it('00:00 MEZ am 20.11.: der 20.11. ist heute → 200', async () => {
      clock.set('2026-11-19T23:00:00Z');
      const day = await service.findOne('2026-11-20');
      expect(day.isToday).toBe(true);
    });

    it('Zukunft wird vor „keine Daten“ geprüft (morgen ohne Daten → 400, nicht 404)', async () => {
      await expect(service.findOne('2026-11-21')).rejects.toMatchObject({ response: { code: 'DATE_IN_FUTURE' } });
    });
  });

  it('Controller setzt Content-Location für today', async () => {
    const res = { setHeader: jest.fn() } as unknown as Response;
    const day = await controller.findToday(res);
    expect(day.date).toBe('2026-11-20');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Location', '/api/days/2026-11-20');
  });
});
