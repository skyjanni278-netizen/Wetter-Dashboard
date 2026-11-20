import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { Clock, FixedClock } from '../common/clock';
import type { ObservationHour } from '../observations/observation';
import { OBSERVATION_STORE } from '../observations/observation.store';
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

  async getDataRange() {
    return { from: '2026-11-10', to: '2026-11-20' };
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
        { provide: OBSERVATION_STORE, useClass: FakeObservationStore },
        { provide: Clock, useValue: clock },
      ],
    }).compile();
    service = moduleRef.get(DaysService);
    controller = moduleRef.get(DaysController);
  });

  it('findOne liefert den Tag in der Form aus B2.2, Werte ungerundet, null bleibt null', async () => {
    const day = await service.findOne('2026-11-10');
    expect(day).toMatchObject({
      id: '2026-11-10',
      date: '2026-11-10',
      locationId: 1,
      timezone: 'Europe/Berlin',
      isToday: false,
      hoursExpected: 24,
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
    });
    expect(day.hours[5].temperature).toBeNull();
    expect(day.hours[0]).not.toHaveProperty('timeUtc');
  });

  it('heute ist der Berliner Tag aus der Clock (00:30 MEZ → 20.11.)', async () => {
    const day = await service.findToday();
    expect(day.date).toBe('2026-11-20');
    expect(day.isToday).toBe(true);
  });

  it('unbekannter Tag → NotFoundException', async () => {
    await expect(service.findOne('2024-12-31')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Controller setzt Content-Location für today', async () => {
    const res = { setHeader: jest.fn() } as unknown as Response;
    const day = await controller.findToday(res);
    expect(day.date).toBe('2026-11-20');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Location', '/api/days/2026-11-20');
  });
});
