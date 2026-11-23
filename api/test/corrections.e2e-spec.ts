import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { loadFixture } from '../src/fixtures/fixture';
import { ImportRunner } from '../src/imports/import-runner';
import { DUMMY_PASSWORD_HASH } from '../src/users/password';
import { UsersService } from '../src/users/users.service';
import { OpenMeteoClient } from '../src/weather-provider/open-meteo.client';
import type { HourlyRequest } from '../src/weather-provider/open-meteo.client';
import { createTestApp } from './support/app';
import { adminToken, authHeader } from './support/auth';
import { storedRow } from './support/database';
import { forecastDays, providerHours } from './support/fakes';
import { seedApp } from './support/seed';

/**
 * Schritt 12a (Roadmap „Fertig, wenn …“ ohne Browser; US13-1 bis -18, US06-7, US16-1 bis -3, US17-1/-2, R20, R33):
 * Nest mit `FixedClock` 2026-11-19T13:30:00Z (14:30 MEZ) auf `:memory:`, Fixture `us16-ok`, gemockter Provider
 * (kein Netz). Admin-Konto `id = 1` (FK `correction.corrected_by`), Token über `adminToken`.
 *
 * Die IDs der Roadmap (Stunde 16503, Korrektur 3, `ETag "3"`) stammen aus dem Altbestand. Hier ist die Stunde
 * 18.11.2026 14:00 MEZ (ein vollständiger Tag, damit auch `summaries/years/2026` die Korrektur zeigt). Für das
 * Beispiel `ETag "3"` → `"4"` → `"5"` bekommt sie vorher per SQL `version = 3` und `temperature = 19,6`, wie nach
 * zwei Importen, die den Wert geändert haben (jeder Schreibweg zählt `version` hoch, B3.4). Die Korrektur-ID ist die
 * echte aus der Antwort.
 */
const NOW = '2026-11-19T13:30:00Z';
const HOUR = '2026-11-18T13:00:00Z'; // 18.11. 14:00 MEZ
const PREDICTION = '2026-11-19T17:00:00Z'; // 19.11. 18:00 MEZ, Vorhersage (US13-8)
const REASON = 'Ausreißer, Nachbarstunden 9,4/9,8 °C';
const MERGE_PATCH = 'application/merge-patch+json';

function fakeProvider() {
  return {
    fetchHourly: jest.fn(async (req: HourlyRequest) => {
      const days = (Date.parse(`${req.endDate}T00:00:00Z`) - Date.parse(`${req.startDate}T00:00:00Z`)) / 86_400_000 + 1;
      return providerHours(`${req.startDate}T00:00:00Z`, days * 24, () => ({ temperature: 5 }));
    }),
    fetchDailyForecast: jest.fn(async () => forecastDays('2026-11-19')),
  };
}

async function start(options: { schedule?: boolean } = {}) {
  const clock = new FixedClock(NOW);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...(options.schedule ? [ScheduleModule.forRoot()] : [])] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(OpenMeteoClient)
    .useValue(fakeProvider())
    .compile();
  const app: INestApplication<App> = await createTestApp(moduleRef);
  await app.get(UsersService).createAdmin('admin', DUMMY_PASSWORD_HASH, new Date(NOW));
  const admin = authHeader(await adminToken(app));
  const noRole = authHeader(app.get(JwtService).sign({ sub: 99, username: 'test', roles: [] }));
  const dataSource = app.get(DataSource);
  const idOf = async (timeUtc: string) => ((await storedRow(dataSource, timeUtc)) as unknown as { id: number }).id;
  return { app, clock, admin, noRole, dataSource, idOf, server: () => app.getHttpServer() };
}

describe('Schritt 12a: Korrektur (N03) mit ETag, If-Match, Historie, Übersicht und Rücknahme', () => {
  let h: Awaited<ReturnType<typeof start>>;
  let id: number;
  let correctionId: number;
  const patchHour = (body: object, ifMatch?: string, type = MERGE_PATCH) => {
    const req = request(h.server()).patch(`/api/observations/${id}`).set(h.admin).set('Content-Type', type);
    return (ifMatch === undefined ? req : req.set('If-Match', ifMatch)).send(body);
  };
  const reversal = (cid: number, body: object, ifMatch?: string) => {
    const req = request(h.server()).post(`/api/observations/${id}/corrections/${cid}/reversal`).set(h.admin);
    return (ifMatch === undefined ? req : req.set('If-Match', ifMatch)).send(body);
  };

  beforeAll(async () => {
    h = await start();
    await seedApp(h.app, loadFixture('us16-ok'), NOW);
    id = await h.idOf(HOUR);
    await h.dataSource.query(`UPDATE "observation" SET "temperature" = 19.6, "version" = 3 WHERE "id" = ?`, [id]);
  });
  afterAll(async () => {
    await h.app.get(ImportRunner).whenIdle();
    await h.app.close();
  });

  it('US13-1: GET /api/observations/:id → 200, ETag "3", Ressource nach B2.2; If-None-Match "3" → 304; 404/400', async () => {
    const res = await request(h.server()).get(`/api/observations/${id}`).expect(200);
    expect(res.headers['etag']).toBe('"3"');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toEqual({
      id,
      locationId: 1,
      timeUtc: HOUR,
      timeLocal: '2026-11-18T14:00:00+01:00',
      localDate: '2026-11-18',
      temperature: 19.6,
      apparentTemperature: 3.8,
      precipitation: 0,
      weatherCode: 3,
      windSpeed: 14.2,
      windDirection: 230,
      source: 'forecast_api',
      isPrediction: false,
      importId: 1,
      fetchedAt: '2026-11-19T13:05:12Z',
      correctedAt: null,
      version: 3,
    });
    await request(h.server()).get(`/api/observations/${id}`).set('If-None-Match', '"3"').expect(304);
    expect((await request(h.server()).get('/api/observations/999999').expect(404)).body.code).toBe('NOT_FOUND');
    expect((await request(h.server()).get('/api/observations/abc').expect(400)).body.errors[0]).toMatchObject({ field: 'id' });
  });

  it('Ausgangslage: der Wert 19,6 ist der Rekord und das Jahresmaximum (nicht korrigiert)', async () => {
    const records = (await request(h.server()).get('/api/records').expect(200)).body;
    expect(records.hottest).toEqual({ value: 19.6, timeLocal: '2026-11-18T14:00', date: '2026-11-18', observationId: id, corrected: false });
    expect((await request(h.server()).get('/api/summaries/years/2026').expect(200)).body.temperature.max).toBe(19.6);
  });

  it('US13-3: PATCH ohne If-Match → 428 PRECONDITION_REQUIRED im Fehlerformat; If-Match: * ebenso', async () => {
    const res = await patchHour({ temperature: 9.6, reason: REASON }).expect(428);
    expect(res.body).toMatchObject({
      statusCode: 428,
      error: 'Precondition Required',
      code: 'PRECONDITION_REQUIRED',
      errors: [],
      path: `/api/observations/${id}`,
      details: null,
    });
    await patchHour({ temperature: 9.6, reason: REASON }, '*').expect(428);
  });

  it('US13-9 / US13-10: ohne Token 401, ohne Rolle 403, Content-Type text/plain 415', async () => {
    await request(h.server()).patch(`/api/observations/${id}`).set('If-Match', '"3"').send({ temperature: 9.6, reason: REASON }).expect(401);
    const forbidden = await request(h.server())
      .patch(`/api/observations/${id}`)
      .set(h.noRole)
      .set('If-Match', '"3"')
      .send({ temperature: 9.6, reason: REASON })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    for (const url of [`/api/observations/${id}/corrections`, '/api/corrections?from=2026-11-19&to=2026-11-19']) {
      await request(h.server()).get(url).expect(401);
      await request(h.server()).get(url).set(h.noRole).expect(403);
    }
    await request(h.server()).post(`/api/observations/${id}/corrections/1/reversal`).send({ reason: 'x' }).expect(401);
    await request(h.server()).post(`/api/observations/${id}/corrections/1/reversal`).set(h.noRole).send({ reason: 'xyz' }).expect(403);
    const unsupported = await patchHour('temperature=9.6' as unknown as object, '"3"', 'text/plain').expect(415);
    expect(unsupported.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('US13-5/-6/-7: 400 am Feld (R16), unbekanntes Feld, nur Begründung', async () => {
    const tooHot = await patchHour({ temperature: 51, reason: REASON }, '"3"').expect(400);
    expect(tooHot.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'temperature', code: 'too_big' }] });
    const source = await patchHour({ temperature: 9.6, source: 'archive', reason: REASON }, '"3"').expect(400);
    expect(source.body.errors[0]).toEqual({ field: 'source', code: 'unrecognized_keys', message: 'Das Feld „source“ ist nicht erlaubt.' });
    const onlyReason = await patchHour({ reason: 'nur Begründung' }, '"3"').expect(400);
    expect(onlyReason.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: null, code: 'missing_measurement' }] });
    expect(await storedRow(h.dataSource, HOUR)).toMatchObject({ temperature: 19.6, version: 3 });
  });

  it('US13-2: PATCH If-Match "3" { temperature: 9.6, reason } → 200, ETag "4", correctedAt gesetzt', async () => {
    h.clock.set('2026-11-19T13:20:00Z');
    try {
      const res = await patchHour({ temperature: 9.6, reason: REASON }, '"3"').expect(200);
      expect(res.headers['etag']).toBe('"4"');
      expect(res.body).toMatchObject({ id, temperature: 9.6, version: 4, correctedAt: '2026-11-19T13:20:00Z' });
    } finally {
      h.clock.set(NOW);
    }
  });

  it('US13-4: noch einmal mit If-Match "3", obwohl die Version 4 ist → 412 PRECONDITION_FAILED', async () => {
    const res = await patchHour({ temperature: 9.7, reason: REASON }, '"3"').expect(412);
    expect(res.body).toMatchObject({ statusCode: 412, code: 'PRECONDITION_FAILED', errors: [] });
  });

  it('US13-13: ohne Neustart zeigen /api/records und /api/summaries/years/2026 sofort den neuen Wert; version 4, updated_at neu', async () => {
    const records = (await request(h.server()).get('/api/records').expect(200)).body;
    expect(records.hottest).toMatchObject({ value: 12.3, date: '2026-11-15' });
    expect((await request(h.server()).get('/api/summaries/years/2026').expect(200)).body.temperature.max).toBe(12.3);
    expect(await storedRow(h.dataSource, HOUR)).toMatchObject({
      temperature: 9.6,
      version: 4,
      corrected_at: '2026-11-19T13:20:00Z',
      updated_at: '2026-11-19T13:20:00Z',
    });
  });

  it('US13-12: /api/days/2026-11-18 mit correctedAt an der Stunde, Liste mit hasCorrections nur am 18.11.', async () => {
    const day = (await request(h.server()).get('/api/days/2026-11-18').expect(200)).body;
    const hour = day.hours.find((x: { id: number }) => x.id === id);
    expect(hour).toMatchObject({ timeLocal: '2026-11-18T14:00', temperature: 9.6, correctedAt: '2026-11-19T13:20:00Z' });
    expect(day.hours.filter((x: { correctedAt: string | null }) => x.correctedAt !== null)).toHaveLength(1);
    const list = (await request(h.server()).get('/api/days?from=2026-11-01&to=2026-11-19').expect(200)).body.items;
    expect(list.filter((d: { hasCorrections: boolean }) => d.hasCorrections).map((d: { date: string }) => d.date)).toEqual(['2026-11-18']);
  });

  it('US13-11: GET /api/observations/:id/corrections (Admin) → Eintrag mit field, oldValue, newValue, reason, correctedBy', async () => {
    const res = await request(h.server()).get(`/api/observations/${id}/corrections`).set(h.admin).expect(200);
    expect(res.body.items).toEqual([
      {
        id: expect.any(Number),
        observationId: id,
        field: 'temperature',
        oldValue: 19.6,
        newValue: 9.6,
        reason: REASON,
        correctedBy: 1,
        correctedAt: '2026-11-19T13:20:00Z',
        revertsCorrectionId: null,
      },
    ]);
    correctionId = res.body.items[0].id;
    await request(h.server()).get('/api/observations/999999/corrections').set(h.admin).expect(404);
  });

  it('US13-14: GET /api/corrections?from=2026-11-19&to=2026-11-19&page=1&limit=20 → { items, meta } mit dem Eintrag aus US13-2', async () => {
    const res = await request(h.server()).get('/api/corrections?from=2026-11-19&to=2026-11-19&page=1&limit=20').set(h.admin).expect(200);
    expect(res.body).toEqual({
      items: [
        {
          id: correctionId,
          observationId: id,
          observationTimeLocal: '2026-11-18T14:00:00+01:00',
          field: 'temperature',
          oldValue: 19.6,
          newValue: 9.6,
          reason: REASON,
          correctedBy: 1,
          correctedAt: '2026-11-19T13:20:00Z',
          revertsCorrectionId: null,
        },
      ],
      meta: { page: 1, limit: 20, total: 1 },
    });
    expect((await request(h.server()).get('/api/corrections?from=2026-11-18&to=2026-11-18').set(h.admin).expect(200)).body).toEqual({
      items: [],
      meta: { page: 1, limit: 20, total: 0 },
    });
  });

  it('US13-15: ohne Token 401, to vor from 400 to_before_from, limit=101 400 an limit, to nach heute 400 DATE_IN_FUTURE', async () => {
    await request(h.server()).get('/api/corrections?from=2026-11-19&to=2026-11-19').expect(401);
    const order = await request(h.server()).get('/api/corrections?from=2026-11-19&to=2026-11-01').set(h.admin).expect(400);
    expect(order.body.errors[0]).toMatchObject({ field: 'to', code: 'to_before_from' });
    const limit = await request(h.server()).get('/api/corrections?from=2026-11-19&to=2026-11-19&limit=101').set(h.admin).expect(400);
    expect(limit.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'limit' }] });
    const future = await request(h.server()).get('/api/corrections?from=2026-11-19&to=2026-11-20').set(h.admin).expect(400);
    expect(future.body).toMatchObject({ code: 'DATE_IN_FUTURE', errors: [{ field: 'to' }] });
  });

  it('R20: range-Import über die korrigierte Stunde → skippedCorrected = 1, der Wert bleibt 9,6, requestedBy = Konto', async () => {
    const created = await request(h.server()).post('/api/imports').set(h.admin).send({ kind: 'range', from: '2026-11-18', to: '2026-11-18' }).expect(202);
    expect(created.body).toMatchObject({ requestedBy: 1, overwriteCorrections: false });
    await h.app.get(ImportRunner).whenIdle();
    const done = (await request(h.server()).get(`/api/imports/${created.body.id}`).set(h.admin).expect(200)).body;
    expect(done).toMatchObject({ status: 'succeeded', requestedBy: 1, counts: { skippedCorrected: 1, updated: 23 } });
    const after = await request(h.server()).get(`/api/observations/${id}`).expect(200);
    expect(after.body).toMatchObject({ temperature: 9.6, version: 4 });
    expect(after.headers['etag']).toBe('"4"');
  });

  it('US13-16: Rücknahme mit If-Match "4" → 200, ETag "5", Wert 19,6, correctedAt null; Historie mit 2 Einträgen; Cache sofort neu', async () => {
    const res = await reversal(correctionId, { reason: 'Rücknahme: Wert war plausibel' }, '"4"').expect(200);
    expect(res.headers['etag']).toBe('"5"');
    expect(res.body).toMatchObject({ id, temperature: 19.6, version: 5, correctedAt: null });
    const history = (await request(h.server()).get(`/api/observations/${id}/corrections`).set(h.admin).expect(200)).body.items;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ revertsCorrectionId: correctionId, oldValue: 9.6, newValue: 19.6, field: 'temperature', correctedBy: 1 });
    expect((await request(h.server()).get('/api/records').expect(200)).body.hottest).toMatchObject({ value: 19.6, observationId: id, corrected: false });
    expect((await request(h.server()).get('/api/summaries/years/2026').expect(200)).body.temperature.max).toBe(19.6);
    expect(await storedRow(h.dataSource, HOUR)).toMatchObject({ corrected_at: null, version: 5, updated_at: NOW });
  });

  it('US13-17: dieselbe Rücknahme noch einmal (If-Match "5") → 409; Rücknahme einer älteren Korrektur desselben Felds → 409', async () => {
    const again = await reversal(correctionId, { reason: 'noch einmal' }, '"5"').expect(409);
    expect(again.body.code).toBe('CORRECTION_NOT_REVERSIBLE');
    await patchHour({ temperature: 9.7, reason: 'erste neue Korrektur' }, '"5"').expect(200);
    await patchHour({ temperature: 9.8, reason: 'zweite neue Korrektur' }, '"6"').expect(200);
    const items = (await request(h.server()).get(`/api/observations/${id}/corrections`).set(h.admin).expect(200)).body.items;
    const older = items.find((e: { newValue: number }) => e.newValue === 9.7).id as number;
    const blocked = await reversal(older, { reason: 'die ältere zurück' }, '"7"').expect(409);
    expect(blocked.body).toMatchObject({ statusCode: 409, code: 'CORRECTION_NOT_REVERSIBLE' });
  });

  it('US13-18: ohne If-Match 428, veraltet 412, Korrektur 999 404, ohne Token 401, ohne reason 400, text/plain 415', async () => {
    const latest = (await request(h.server()).get(`/api/observations/${id}/corrections`).set(h.admin).expect(200)).body.items[0].id as number;
    expect((await reversal(latest, { reason: 'Rücknahme' }).expect(428)).body.code).toBe('PRECONDITION_REQUIRED');
    expect((await reversal(latest, { reason: 'Rücknahme' }, '"5"').expect(412)).body.code).toBe('PRECONDITION_FAILED');
    expect((await reversal(999, { reason: 'Rücknahme' }, '"7"').expect(404)).body.code).toBe('NOT_FOUND');
    await request(h.server()).post(`/api/observations/${id}/corrections/${latest}/reversal`).set('If-Match', '"7"').send({ reason: 'x' }).expect(401);
    expect((await reversal(latest, {}, '"7"').expect(400)).body.errors[0]).toMatchObject({ field: 'reason' });
    expect((await reversal(latest, { reason: 'Rücknahme', temperature: 1 }, '"7"').expect(400)).body.errors[0]).toMatchObject({
      field: 'temperature',
      code: 'unrecognized_keys',
    });
    await request(h.server())
      .post(`/api/observations/${id}/corrections/${latest}/reversal`)
      .set(h.admin)
      .set('If-Match', '"7"')
      .set('Content-Type', 'text/plain')
      .send('reason=x')
      .expect(415);
    // Die jüngste ist rücknehmbar; die Stunde bleibt korrigiert (9,7 wirkt weiter), Version 8.
    const ok = await reversal(latest, { reason: 'Rücknahme der zweiten' }, '"7"').expect(200);
    expect(ok.headers['etag']).toBe('"8"');
    expect(ok.body).toMatchObject({ temperature: 9.7, correctedAt: NOW });
  });

  it('US13-8: Vorhersagestunde 19.11. 18:00 → 409 OBSERVATION_IS_PREDICTION', async () => {
    const predictionId = await h.idOf(PREDICTION);
    const res = await request(h.server())
      .patch(`/api/observations/${predictionId}`)
      .set(h.admin)
      .set('Content-Type', MERGE_PATCH)
      .set('If-Match', '"1"')
      .send({ temperature: 9.6, reason: REASON })
      .expect(409);
    expect(res.body).toMatchObject({ statusCode: 409, code: 'OBSERVATION_IS_PREDICTION' });
  });

  it('US06-7: PATCH mit application/json macht eine Stunde zur kältesten → coldest.corrected = true, hottest.corrected = false', async () => {
    const coldId = await h.idOf('2026-11-17T05:00:00Z');
    await request(h.server())
      .patch(`/api/observations/${coldId}`)
      .set(h.admin)
      .set('If-Match', '"1"')
      .send({ temperature: -20, reason: 'Kältester Wert laut Vergleichsstation' })
      .expect(200);
    const records = (await request(h.server()).get('/api/records').expect(200)).body;
    expect(records.coldest).toMatchObject({ value: -20, observationId: coldId, corrected: true });
    // Die korrigierte Stunde HOUR hat jetzt 9,7 °C; Rekord ist wieder der 15.11. (nicht korrigiert).
    expect(records.hottest).toMatchObject({ value: 12.3, date: '2026-11-15', corrected: false });
  });

  it('R20: range-Import mit overwriteCorrections = true überschreibt, correctedAt = null, die Historie bleibt', async () => {
    const before = (await request(h.server()).get(`/api/observations/${id}/corrections`).set(h.admin).expect(200)).body.items.length;
    const created = await request(h.server())
      .post('/api/imports')
      .set(h.admin)
      .send({ kind: 'range', from: '2026-11-18', to: '2026-11-18', overwriteCorrections: true })
      .expect(202);
    expect(created.body).toMatchObject({ overwriteCorrections: true, requestedBy: 1 });
    await h.app.get(ImportRunner).whenIdle();
    const done = (await request(h.server()).get(`/api/imports/${created.body.id}`).set(h.admin).expect(200)).body;
    expect(done.counts).toMatchObject({ skippedCorrected: 0, updated: 1, unchanged: 23 });
    expect((await request(h.server()).get(`/api/observations/${id}`).expect(200)).body).toMatchObject({ temperature: 5, correctedAt: null });
    expect((await request(h.server()).get(`/api/observations/${id}/corrections`).set(h.admin).expect(200)).body.items).toHaveLength(before);
  });
});

describe('Schritt 12a: Datenstand (N01) und Kennzahlen (N04) unter /api/status', () => {
  it('US17-1 (us16-ok): daysWithData, daysComplete, gapCount gesetzt; kein Fehlertext; ohne Scheduler nextScheduledUpdateAt null (US16-3)', async () => {
    const h = await start();
    try {
      await seedApp(h.app, loadFixture('us16-ok'), NOW);
      const res = await request(h.server()).get('/api/status').expect(200);
      expect(res.body).toEqual({
        locationId: 1,
        today: '2026-11-19',
        timezone: 'Europe/Berlin',
        dataFrom: '2026-11-10',
        dataTo: '2026-11-19',
        lastSuccessfulUpdateAt: '2026-11-19T13:05:12Z',
        nextScheduledUpdateAt: null,
        updateState: 'ok',
        daysWithData: 10,
        daysComplete: 9,
        gapCount: 0,
      });
      for (const key of ['error', 'message', 'reason']) expect(res.body).not.toHaveProperty(key);
    } finally {
      await h.app.close();
    }
  });

  it('US16-2 / US17-2 (us16-delayed): letzter Erfolg 11:05 bei 14:30 → delayed; gapCount = Länge von GET /api/gaps', async () => {
    const h = await start();
    try {
      await seedApp(h.app, loadFixture('us16-delayed'), NOW);
      const status = (await request(h.server()).get('/api/status').expect(200)).body;
      expect(status).toMatchObject({ lastSuccessfulUpdateAt: '2026-11-19T10:05:12Z', updateState: 'delayed' });
      const gaps = await request(h.server()).get(`/api/gaps?from=${status.dataFrom}&to=${status.today}`).set(h.admin).expect(200);
      expect(gaps.body.items.length).toBeGreaterThan(0);
      expect(status.gapCount).toBe(gaps.body.items.length);
    } finally {
      await h.app.close();
    }
  });

  it('US16-1: mit Scheduler (ScheduleModule, Job scheduled-import) → nextScheduledUpdateAt = 2026-11-19T14:05:00Z, ok', async () => {
    const h = await start({ schedule: true });
    try {
      await seedApp(h.app, loadFixture('us16-ok'), NOW);
      expect((await request(h.server()).get('/api/status').expect(200)).body).toMatchObject({
        lastSuccessfulUpdateAt: '2026-11-19T13:05:12Z',
        nextScheduledUpdateAt: '2026-11-19T14:05:00Z',
        updateState: 'ok',
      });
    } finally {
      await h.app.close();
    }
  });

  it('B2.4: eine Korrektur ändert die Kennzahlen ohne Neustart (Cache nach Datenrevision): null bei Temperatur → Lücke', async () => {
    const h = await start();
    try {
      await seedApp(h.app, loadFixture('us16-ok'), NOW);
      expect((await request(h.server()).get('/api/status').expect(200)).body).toMatchObject({ daysComplete: 9, gapCount: 0 });
      const hourId = await h.idOf(HOUR);
      await request(h.server())
        .patch(`/api/observations/${hourId}`)
        .set(h.admin)
        .set('If-Match', '"1"')
        .send({ temperature: null, reason: 'Sensor defekt' })
        .expect(200);
      expect((await request(h.server()).get('/api/status').expect(200)).body).toMatchObject({ daysComplete: 8, gapCount: 1 });
    } finally {
      await h.app.close();
    }
  });
});

describe('Schritt 12a: Fixture us06-corrected (US06-7, US13-12, US13-14; Browser-Prüfung)', () => {
  it('coldest.corrected = true, hottest.corrected = false; Stunde 19.11. 14:00 mit correctedAt; Übersicht mit 2 Einträgen', async () => {
    const h = await start();
    try {
      const summary = await seedApp(h.app, loadFixture('us06-corrected'), NOW);
      expect(summary.corrections).toBe(2);
      const records = (await request(h.server()).get('/api/records').expect(200)).body;
      expect(records.coldest).toMatchObject({ value: -1.5, date: '2026-11-18', timeLocal: '2026-11-18T06:00', corrected: true });
      expect(records.hottest).toMatchObject({ value: 12.3, corrected: false });
      const today = (await request(h.server()).get('/api/days/2026-11-19').expect(200)).body;
      expect(today.hours.find((x: { timeLocal: string }) => x.timeLocal === '2026-11-19T14:00')).toMatchObject({
        temperature: 9.6,
        correctedAt: '2026-11-19T13:20:00Z',
      });
      const list = await request(h.server()).get('/api/corrections?from=2026-11-19&to=2026-11-19').set(h.admin).expect(200);
      expect(list.body.items.map((e: { observationTimeLocal: string }) => e.observationTimeLocal)).toEqual([
        '2026-11-18T06:00:00+01:00',
        '2026-11-19T14:00:00+01:00',
      ]);
      expect(list.body.items[1]).toMatchObject({ oldValue: 19.6, newValue: 9.6, reason: REASON, correctedBy: 1 });
      // Die Korrektur aus der Fixture ist rücknehmbar (R33).
      const coldId = records.coldest.observationId as number;
      const etag = (await request(h.server()).get(`/api/observations/${coldId}`).expect(200)).headers['etag'];
      await request(h.server())
        .post(`/api/observations/${coldId}/corrections/${list.body.items[0].id}/reversal`)
        .set(h.admin)
        .set('If-Match', etag)
        .send({ reason: 'Rücknahme für den Test' })
        .expect(200);
      expect((await request(h.server()).get('/api/records').expect(200)).body.coldest).toMatchObject({ value: 1, corrected: false });
    } finally {
      await h.app.close();
    }
  });
});
