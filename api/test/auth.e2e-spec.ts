import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/auth/jwt-config';
import { Clock, FixedClock } from '../src/common/clock';
import { ImportRunner } from '../src/imports/import-runner';
import { SCHEDULER_ENABLED } from '../src/scheduler/scheduler-enabled';
import { SchedulerService } from '../src/scheduler/scheduler.service';
import { hashPassword } from '../src/users/password';
import { UsersService } from '../src/users/users.service';
import { OpenMeteoClient } from '../src/weather-provider/open-meteo.client';
import { createTestApp } from './support/app';
import { adminToken, authHeader, ResettableThrottlerStorage } from './support/auth';
import { findPasswordLeaks, scannedResponses } from './support/password-scan';
import { registeredRoutes } from './support/routes';
import { dayObservations, fixtureOf, seedApp } from './support/seed';

/**
 * Schritt 10 (Roadmap „Fertig, wenn …“, US09, US10-1, US11-5, US12-4): echter Login-Weg mit bcrypt (Kosten 12),
 * JWT und den globalen Guards auf `:memory:`. Der Throttler-Speicher wird vor jedem Test geleert, weil alle
 * Anfragen von derselben IP kommen.
 */
const PASSWORD = 'richtiges-Passwort-42';
const REQUEST_ID = /^[0-9a-f]{8}$/;
const NOW = '2026-11-19T13:30:00Z';

const offlineProvider = {
  fetchHourly: jest.fn(async () => {
    throw new Error('kein Netz im Test');
  }),
  fetchDailyForecast: jest.fn(async () => {
    throw new Error('kein Netz im Test');
  }),
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('Schritt 10: Login, JWT, JwtAuthGuard (US09, US10-1, US11-5, US12-4)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const storage = new ResettableThrottlerStorage();
  const clock = new FixedClock(NOW);

  const server = () => app.getHttpServer();
  const login = (body: unknown) => request(server()).post('/api/auth/tokens').send(body as object);
  const claims = { sub: 1, username: 'admin', roles: ['admin'] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .overrideProvider(OpenMeteoClient)
      .useValue(offlineProvider)
      .overrideProvider(ThrottlerStorage)
      .useValue(storage)
      .compile();
    app = await createTestApp(moduleRef);
    jwt = app.get(JwtService);
    await app.get(UsersService).createAdmin('admin', await hashPassword(PASSWORD), clock.now());
    await seedApp(app, fixtureOf(dayObservations('2026-11-18')), clock.now());
  });
  beforeEach(() => storage.reset());
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  it('US09-1: richtige Daten → 200 { accessToken, tokenType, expiresIn: 3600, user }, kein Hash, keine Location', async () => {
    const res = await login({ username: 'admin', password: PASSWORD }).expect(200);
    expect(Object.keys(res.body)).toEqual(['accessToken', 'tokenType', 'expiresIn', 'user']);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, user: { id: 1, username: 'admin', roles: ['admin'] } });
    expect(Object.keys(res.body.user)).toEqual(['id', 'username', 'roles']);
    expect(res.headers['location']).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);

    const [header, payload] = (res.body.accessToken as string).split('.');
    expect(decodePart(header)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const decoded = decodePart(payload);
    expect(decoded).toMatchObject({ sub: 1, username: 'admin', roles: ['admin'], iss: JWT_ISSUER, aud: JWT_AUDIENCE });
    expect(Number(decoded['exp']) - Number(decoded['iat'])).toBe(3600);
  });

  it('R21: Benutzername wird getrimmt und klein geschrieben; Erfolg setzt lastLoginAt', async () => {
    const res = await login({ username: '  ADMIN ', password: PASSWORD }).expect(200);
    const me = await request(server()).get('/api/auth/me').set(authHeader(res.body.accessToken)).expect(200);
    expect(me.body.lastLoginAt).toBe(NOW);
  });

  it('US09-2/-3: falsches Passwort und unbekannter Name → 401 INVALID_CREDENTIALS mit derselben Meldung', async () => {
    const wrong = await login({ username: 'admin', password: 'falsch-falsch-falsch' }).expect(401);
    const unknown = await login({ username: 'niemand', password: PASSWORD }).expect(401);
    const body = {
      statusCode: 401,
      error: 'Unauthorized',
      code: 'INVALID_CREDENTIALS',
      message: 'Benutzername oder Passwort ist falsch.',
      errors: [],
      path: '/api/auth/tokens',
      timestamp: NOW,
      requestId: expect.stringMatching(REQUEST_ID),
      details: null,
    };
    expect(wrong.body).toEqual(body);
    expect(unknown.body).toEqual(body);
  });

  it('US09-3: Median von je 10 Anfragen (falsches Passwort / unbekannter Name) unterscheidet sich um ≤ 50 ms', async () => {
    const time = async (body: object): Promise<number> => {
      storage.reset(); // sonst greift nach 5 Versuchen das Login-Limit
      const start = process.hrtime.bigint();
      await login(body).expect(401);
      return Number(process.hrtime.bigint() - start) / 1e6;
    };
    await time({ username: 'admin', password: 'aufwaermen-aufwaermen' }); // JIT, erste Verbindung
    const wrongPassword: number[] = [];
    const unknownUser: number[] = [];
    for (let i = 0; i < 10; i++) {
      wrongPassword.push(await time({ username: 'admin', password: `falsch-${i}-falsch-falsch` }));
      unknownUser.push(await time({ username: `niemand${i}`, password: `falsch-${i}-falsch-falsch` }));
    }
    const difference = Math.abs(median(wrongPassword) - median(unknownUser));
    // Ohne Dummy-compare läge der unbekannte Name bei wenigen ms, das bekannte Konto bei der bcrypt-Zeit (~300 ms).
    expect(median(unknownUser)).toBeGreaterThan(50);
    expect(difference).toBeLessThanOrEqual(50);
  }, 60_000);

  it('US09-4: Body ohne password → 400, field "password"', async () => {
    const res = await login({ username: 'admin' }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'password', code: 'invalid_type' }] });
  });

  it('US09-5: zusätzliches Feld "roles" → 400 VALIDATION_FAILED, errors[0] = { field: "roles", code: "unrecognized_keys" }', async () => {
    const res = await login({ username: 'admin', password: PASSWORD, roles: ['admin'] }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors[0]).toEqual({ field: 'roles', code: 'unrecognized_keys', message: expect.any(String) });
  });

  it('Passwort über 72 Byte und zu kurzer Name → 400 an den Feldern', async () => {
    const res = await login({ username: 'ad', password: 'ä'.repeat(37) }).expect(400);
    expect(res.body.errors).toEqual([
      { field: 'username', code: 'too_small', message: expect.any(String) },
      { field: 'password', code: 'too_big', message: expect.any(String) },
    ]);
  });

  it('US09-6: Content-Type text/plain → 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const res = await request(server()).post('/api/auth/tokens').set('Content-Type', 'text/plain').send('x').expect(415);
    expect(res.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', path: '/api/auth/tokens' });
  });

  it('US09-7: 6. Fehlversuch innerhalb von 60 s → 429 TOO_MANY_REQUESTS (auch mit richtigem Passwort); andere Routen ungebremst', async () => {
    for (let i = 0; i < 5; i++) await login({ username: 'admin', password: 'falsch-falsch-falsch' }).expect(401);
    const blocked = await login({ username: 'admin', password: 'falsch-falsch-falsch' }).expect(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      code: 'TOO_MANY_REQUESTS',
      message: expect.any(String),
      errors: [],
      path: '/api/auth/tokens',
      timestamp: NOW,
      requestId: expect.stringMatching(REQUEST_ID),
      details: null,
    });
    expect(Number(blocked.headers['retry-after-login'])).toBeGreaterThan(0);
    await login({ username: 'admin', password: PASSWORD }).expect(429);
    // Das Login-Limit gilt nur für den Login (03 B3.2); das globale Limit (Schritt 11) ist in Tests hoch gesetzt
    // (test-env.ts) und wird in access.e2e-spec.ts geprüft.
    for (let i = 0; i < 10; i++) await request(server()).get('/api/status').expect(200);
  });

  it('Reihenfolge der Guards (03 B4.3): ThrottlerGuard vor JwtAuthGuard; bei 429 läuft der JwtAuthGuard nicht', async () => {
    const throttler = jest.spyOn(ThrottlerGuard.prototype, 'canActivate');
    const auth = jest.spyOn(JwtAuthGuard.prototype, 'canActivate');
    await request(server()).get('/api/auth/me').expect(401);
    expect(throttler).toHaveBeenCalledTimes(1);
    expect(auth).toHaveBeenCalledTimes(1);
    expect(throttler.mock.invocationCallOrder[0]).toBeLessThan(auth.mock.invocationCallOrder[0]);

    for (let i = 0; i < 5; i++) await login({ username: 'admin', password: 'falsch-falsch-falsch' }).expect(401);
    auth.mockClear();
    await login({ username: 'admin', password: PASSWORD }).expect(429);
    expect(auth).not.toHaveBeenCalled();
  });

  describe('US09-8: GET /api/auth/me', () => {
    it('ohne Token → 401 UNAUTHENTICATED; mit Token → 200 Konto ohne Hash', async () => {
      const anonymous = await request(server()).get('/api/auth/me').expect(401);
      expect(anonymous.body).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED', path: '/api/auth/me', errors: [], details: null });

      const token = (await login({ username: 'admin', password: PASSWORD }).expect(200)).body.accessToken as string;
      const me = await request(server()).get('/api/auth/me').set(authHeader(token)).expect(200);
      expect(me.body).toEqual({
        id: 1,
        username: 'admin',
        roles: ['admin'],
        isActive: true,
        createdAt: NOW,
        lastLoginAt: NOW,
      });
      // Schema „Bearer“ ohne Rücksicht auf Groß-/Kleinschreibung.
      await request(server()).get('/api/auth/me').set('Authorization', `bearer ${token}`).expect(200);
    });

    it.each([
      ['abgelaufen', () => jwt.sign(claims, { expiresIn: -10 })],
      ['falsches aud', () => jwt.sign(claims, { audience: 'jemand-anderes' })],
      ['falsches iss', () => jwt.sign(claims, { issuer: 'jemand-anderes' })],
      ['anderes Secret', () => jwt.sign(claims, { secret: 'ein-ganz-anderes-secret-mit-32-zeichen!' })],
      ['HS512 statt HS256', () => jwt.sign(claims, { algorithm: 'HS512' })],
      [
        'Algorithmus none',
        () => {
          const now = Math.floor(Date.now() / 1000);
          const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
          return `${part({ alg: 'none', typ: 'JWT' })}.${part({ ...claims, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: now, exp: now + 3600 })}.`;
        },
      ],
      ['kein JWT', () => 'kein.jwt.token'],
      ['sub als Text', () => jwt.sign({ ...claims, sub: '1' })],
    ])('Token %s → 401 UNAUTHENTICATED', async (_name, token) => {
      const res = await request(server()).get('/api/auth/me').set(authHeader(token())).expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('Authorization ohne Bearer-Schema → 401', async () => {
      await request(server()).get('/api/auth/me').set('Authorization', `Basic ${Buffer.from('admin:x').toString('base64')}`).expect(401);
    });
  });

  describe('Admin-Endpunkte ohne @Public() (US10-1, US11-5, US12-4)', () => {
    it.each([
      ['POST', '/api/imports'],
      ['GET', '/api/imports'],
      ['GET', '/api/imports/1'],
      ['GET', '/api/gaps?from=2026-11-01&to=2026-11-19'],
    ])('%s %s ohne Token → 401 UNAUTHENTICATED im Fehlerformat', async (method, url) => {
      const req = method === 'POST' ? request(server()).post(url).send({ kind: 'range', from: '2026-11-01', to: '2026-11-02' }) : request(server()).get(url);
      const res = await req.expect(401);
      expect(res.body).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'UNAUTHENTICATED',
        message: 'Anmeldung erforderlich.',
        errors: [],
        path: url.split('?')[0],
        timestamp: NOW,
        requestId: expect.stringMatching(REQUEST_ID),
        details: null,
      });
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });

    it('406 kommt vor dem Guard (03 B3.1: Middleware zuerst), auch ohne Token', async () => {
      await request(server()).get('/api/imports').set('Accept', 'text/html').expect(406);
    });

    it('mit Token aus dem Login: GET /api/imports und GET /api/gaps → 200', async () => {
      const token = (await login({ username: 'admin', password: PASSWORD }).expect(200)).body.accessToken as string;
      expect((await request(server()).get('/api/imports').set(authHeader(token)).expect(200)).body.meta).toMatchObject({ page: 1 });
      await request(server()).get('/api/gaps?from=2026-11-18&to=2026-11-18').set(authHeader(token)).expect(200);
    });
  });

  /** Beispiel-URL je registrierter GET-Route (Express-Schreibweise); eine neue Route ohne Eintrag lässt den Test scheitern. */
  const SAMPLE_URLS: Record<string, string> = {
    '/api/auth/me': '/api/auth/me',
    '/api/days': '/api/days?from=2026-11-01&to=2026-11-19',
    '/api/days/today': '/api/days/today',
    '/api/days/:date': '/api/days/2026-11-18',
    '/api/forecasts': '/api/forecasts',
    '/api/gaps': '/api/gaps?from=2026-11-01&to=2026-11-19',
    '/api/health': '/api/health',
    '/api/imports': '/api/imports',
    '/api/imports/:id': '/api/imports/1',
    '/api/locations': '/api/locations',
    '/api/locations/:id': '/api/locations/1',
    '/api/observations/:id': '/api/observations/1',
    '/api/observations/:id/corrections': '/api/observations/1/corrections',
    '/api/corrections': '/api/corrections?from=2026-11-01&to=2026-11-19',
    '/api/records': '/api/records',
    '/api/status': '/api/status',
    '/api/summaries/months': '/api/summaries/months?year=2026',
    '/api/summaries/months/:yearMonth': '/api/summaries/months/2026-11',
    '/api/summaries/years': '/api/summaries/years',
    '/api/summaries/years/:year': '/api/summaries/years/2026',
    '/api/summaries/periods': '/api/summaries/periods?from=2026-11-01&to=2026-11-19',
  };
  const PROTECTED_GET = [
    '/api/auth/me',
    '/api/gaps',
    '/api/imports',
    '/api/imports/:id',
    '/api/observations/:id/corrections',
    '/api/corrections',
  ];

  it('jede registrierte GET-Route: Gast-Routen ohne Token erreichbar, geschützte nur mit Token; keine Antwort enthält „password“', async () => {
    const token = (await login({ username: 'admin', password: PASSWORD }).expect(200)).body.accessToken as string;
    const gets = registeredRoutes(app).filter(r => r.method === 'GET').map(r => r.path);
    expect(gets.sort()).toEqual(Object.keys(SAMPLE_URLS).sort());

    for (const route of gets) {
      const url = SAMPLE_URLS[route];
      const anonymous = await request(server()).get(url);
      const withToken = await request(server()).get(url).set(authHeader(token));
      if (PROTECTED_GET.includes(route)) {
        expect([route, anonymous.status]).toEqual([route, 401]);
      } else {
        expect([route, anonymous.status]).toEqual([route, withToken.status]);
      }
      expect([route, withToken.status < 500 && withToken.status !== 401]).toEqual([route, true]);
      for (const res of [anonymous, withToken]) {
        expect([route, findPasswordLeaks(res.body)]).toEqual([route, []]);
        expect(res.text).not.toContain(PASSWORD);
      }
    }
    // Das Netz in createTestApp hat alle Antworten dieser Datei geprüft (Auswertung in no-password-leaks.ts).
    expect(scannedResponses()).toBeGreaterThan(gets.length * 2);
  });

  it('das Netz erkennt Schlüssel mit password und bcrypt-Hashes, erlaubt nur errors[].field = "password"', () => {
    expect(findPasswordLeaks({ user: { id: 1, passwordHash: 'x' } })).toEqual(['user.passwordHash']);
    expect(findPasswordLeaks({ items: [{ note: '$2b$12$abcdefghijklmnopqrstuv' }] })).toEqual(['items.0.note']);
    expect(findPasswordLeaks({ message: 'wrong password' })).toEqual(['message']);
    expect(findPasswordLeaks({ errors: [{ field: 'password', code: 'invalid_type', message: 'Das Passwort fehlt.' }] })).toEqual([]);
  });

  it('R21: gesperrtes Konto → 401 INVALID_CREDENTIALS wie ein falsches Passwort', async () => {
    const dataSource = app.get(DataSource);
    await dataSource.query(`UPDATE "user" SET "is_active" = 0 WHERE "username" = 'admin'`);
    try {
      const res = await login({ username: 'admin', password: PASSWORD }).expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    } finally {
      await dataSource.query(`UPDATE "user" SET "is_active" = 1 WHERE "username" = 'admin'`);
    }
  });
});

describe('Schritt 10: Scheduler läuft intern ohne Token (kein HTTP, keine Guards)', () => {
  it('tick() legt mit aktivem Schalter einen Import "scheduled" an, obwohl /api/imports ohne Token 401 liefert', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new FixedClock(NOW))
      .overrideProvider(OpenMeteoClient)
      .useValue(offlineProvider)
      .overrideProvider(SCHEDULER_ENABLED)
      .useValue(true)
      .compile();
    const app = await createTestApp(moduleRef);
    try {
      const record = await app.get(SchedulerService).tick();
      expect(record).toMatchObject({ kind: 'scheduled', from: '2026-11-18', to: '2026-11-19' });
      await app.get(ImportRunner).whenIdle();
      await request(app.getHttpServer()).get(`/api/imports/${record!.id}`).expect(401);
      const stored = await request(app.getHttpServer())
        .get(`/api/imports/${record!.id}`)
        .set(authHeader(await adminToken(app)))
        .expect(200);
      expect(stored.body).toMatchObject({ kind: 'scheduled', requestedBy: null });
    } finally {
      await app.close();
    }
  });
});
