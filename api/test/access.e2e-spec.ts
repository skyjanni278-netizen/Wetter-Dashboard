import { Controller, Get, INestApplication } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { Clock, FixedClock } from '../src/common/clock';
import { Public } from '../src/common/public.decorator';
import { Roles } from '../src/common/roles.decorator';
import { ImportRunner } from '../src/imports/import-runner';
import { hashPassword } from '../src/users/password';
import { UsersService } from '../src/users/users.service';
import { OpenMeteoClient, OpenMeteoError } from '../src/weather-provider/open-meteo.client';
import type { HourlyRequest } from '../src/weather-provider/open-meteo.client';
import { createTestApp } from './support/app';
import { adminToken, authHeader, ResettableThrottlerStorage } from './support/auth';
import { testConfig } from './support/config';
import { forecastDays, providerHours } from './support/fakes';
import { accessViolations, routeAccess } from './support/route-access';
import { registeredRoutes } from './support/routes';
import { dayObservations, fixtureOf, seedApp } from './support/seed';

/**
 * Schritt 11 (Roadmap „Fertig, wenn …“, US09-8, US10-2/-3/-7, US11-2, US12-2, C1 A01/A02/A06/A09): RolesGuard als
 * dritter globaler Guard, Prüfung aller Routen auf genau einen Dekorator, globales Limit, Sicherheitsheader,
 * CORS, `trust proxy` und Log-Ereignisse ohne Geheimnisse.
 */
const NOW = '2026-11-20T10:00:00Z';
const PASSWORD = 'richtiges-Passwort-42';
const REQUEST_ID = /^[0-9a-f]{8}$/;

/** Stunden für die angefragten UTC-Tage; Zeiträume im August schlagen fehl (für `status=failed`). */
function makeProvider() {
  let release: () => void = () => undefined;
  let gate: Promise<void> = Promise.resolve();
  const provider = {
    fetchHourly: jest.fn(async (req: HourlyRequest) => {
      await gate;
      if (req.startDate.startsWith('2026-08')) throw new OpenMeteoError('UPSTREAM_ERROR', 'Open-Meteo nicht erreichbar (Test)');
      const days = (Date.parse(`${req.endDate}T00:00:00Z`) - Date.parse(`${req.startDate}T00:00:00Z`)) / 86_400_000 + 1;
      // Temperatur im erlaubten Bereich (CHECK in der DB), auch bei einem Monat (744 Stunden).
      return providerHours(`${req.startDate}T00:00:00Z`, days * 24, i => ({ temperature: 10 + (i % 100) / 10 }));
    }),
    fetchDailyForecast: jest.fn(async () => forecastDays('2026-11-20')),
  };
  return {
    provider,
    hold: () => (gate = new Promise(resolve => (release = resolve))),
    release: () => release(),
  };
}

/** App wie in `main.ts` (AppModule) mit fester Uhr, Fake-Provider, leerbarem Throttler-Speicher und optional anderer Konfiguration. */
async function startApp(options: { config?: Record<string, string | undefined>; extra?: { controllers?: unknown[] } } = {}) {
  const fake = makeProvider();
  const storage = new ResettableThrottlerStorage();
  const controllers = (options.extra?.controllers ?? []) as Type[];
  let builder = Test.createTestingModule({ imports: [AppModule, DiscoveryModule], controllers })
    .overrideProvider(Clock)
    .useValue(new FixedClock(NOW))
    .overrideProvider(OpenMeteoClient)
    .useValue(fake.provider)
    .overrideProvider(ThrottlerStorage)
    .useValue(storage);
  if (options.config) builder = builder.overrideProvider(ConfigService).useValue(testConfig(options.config));
  const app = await createTestApp(await builder.compile());
  return { app, storage, ...fake };
}

/** Token mit gültiger Signatur, aber ohne Rolle (Roadmap Schritt 11: `JwtService.sign({ sub: 99, username: "test", roles: [] })`). */
function tokenWithoutRole(app: INestApplication): string {
  return app.get(JwtService).sign({ sub: 99, username: 'test', roles: [] });
}

describe('Schritt 11: Rollen, RolesGuard, Grundeinstellungen', () => {
  let app: INestApplication<App>;
  let storage: ResettableThrottlerStorage;
  let hold: () => void;
  let release: () => void;
  let admin: Record<string, string>;
  let noRole: Record<string, string>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    ({ app, storage, hold, release } = await startApp());
    await app.get(UsersService).createAdmin('admin', await hashPassword(PASSWORD), new Date(NOW));
    await seedApp(app, fixtureOf(dayObservations('2026-11-18')), NOW);
    admin = authHeader(await adminToken(app));
    noRole = authHeader(tokenWithoutRole(app));
  });
  beforeEach(() => storage.reset());
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    release();
    await app.get(ImportRunner).whenIdle();
    await app.close();
  });

  describe('03 B4.7: jede registrierte Route hat genau einen der Dekoratoren @Public oder @Roles', () => {
    it('alle Handler (DiscoveryService) sind genau die Routen im Router, und keiner verstößt', () => {
      const discovered = routeAccess(app);
      const router = registeredRoutes(app).map(r => `${r.method} ${r.path}`);
      expect(discovered.map(r => r.route).sort()).toEqual([...router].sort());
      expect(discovered.length).toBeGreaterThanOrEqual(19);
      expect(accessViolations(discovered)).toEqual([]);
      // Lesbare Übersicht: Admin-Routen tragen die Rolle admin, alle anderen sind öffentlich.
      const admins = discovered.filter(r => r.roles.length > 0).map(r => `${r.route} ${r.roles.join(',')}`);
      expect(admins).toEqual([
        'GET /api/auth/me admin',
        'GET /api/corrections admin',
        'GET /api/gaps admin',
        'GET /api/imports admin',
        'GET /api/imports/:id admin',
        'GET /api/observations/:id/corrections admin',
        'PATCH /api/observations/:id admin',
        'POST /api/imports admin',
        'POST /api/observations/:id/corrections/:correctionId/reversal admin',
      ]);
      // Schritt 12a: GET /api/observations/:id ist öffentlich (03 B4.7, nötig für das ETag).
      expect(discovered.find(r => r.route === 'GET /api/observations/:id')).toMatchObject({ isPublic: true, roles: [] });
    });

    it('Gegenprobe: ein Controller ohne Dekorator wird gemeldet und liefert 403 (auch mit Admin-Token), einer mit beiden ebenso gemeldet', async () => {
      @Controller('probe')
      class ProbeController {
        @Get('ohne')
        ohne() {
          return { ok: true };
        }

        @Get('beides')
        @Public()
        @Roles('admin')
        beides() {
          return { ok: true };
        }
      }
      const probe = await startApp({ extra: { controllers: [ProbeController] } });
      try {
        expect(accessViolations(routeAccess(probe.app))).toEqual([
          'GET /api/probe/beides (ProbeController.beides): @Public() und @Roles()',
          'GET /api/probe/ohne (ProbeController.ohne): weder @Public() noch @Roles()',
        ]);
        const token = authHeader(await adminToken(probe.app));
        const forbidden = await request(probe.app.getHttpServer()).get('/api/probe/ohne').set(token).expect(403);
        expect(forbidden.body).toMatchObject({ code: 'FORBIDDEN', path: '/api/probe/ohne', errors: [], details: null });
        await request(probe.app.getHttpServer()).get('/api/probe/ohne').expect(401); // JwtAuthGuard zuerst
      } finally {
        await probe.app.close();
      }
    });
  });

  it('Reihenfolge der Guards (03 B4.3): Throttler → JWT → Rollen; 401 ohne Rollenprüfung, 429 ohne JWT und Rollen', async () => {
    const throttler = jest.spyOn(ThrottlerGuard.prototype, 'canActivate');
    const jwt = jest.spyOn(JwtAuthGuard.prototype, 'canActivate');
    const roles = jest.spyOn(RolesGuard.prototype, 'canActivate');

    await request(server()).get('/api/imports').set(noRole).expect(403);
    expect([throttler, jwt, roles].map(spy => spy.mock.calls.length)).toEqual([1, 1, 1]);
    expect(throttler.mock.invocationCallOrder[0]).toBeLessThan(jwt.mock.invocationCallOrder[0]);
    expect(jwt.mock.invocationCallOrder[0]).toBeLessThan(roles.mock.invocationCallOrder[0]);

    roles.mockClear();
    await request(server()).get('/api/imports').expect(401);
    expect(roles).not.toHaveBeenCalled();

    for (let i = 0; i < 5; i++) await request(server()).post('/api/auth/tokens').send({ username: 'admin', password: 'falsch-falsch-1' });
    jwt.mockClear();
    roles.mockClear();
    await request(server()).post('/api/auth/tokens').send({ username: 'admin', password: PASSWORD }).expect(429);
    expect(jwt).not.toHaveBeenCalled();
    expect(roles).not.toHaveBeenCalled();
  });

  describe('US10-2, US09-8: Token ohne Rolle admin → 403', () => {
    it('POST /api/imports → 403 FORBIDDEN im Fehlerformat, es entsteht kein Import', async () => {
      const before = (await request(server()).get('/api/imports').set(admin).expect(200)).body.meta.total as number;
      const res = await request(server())
        .post('/api/imports')
        .set(noRole)
        .send({ kind: 'range', from: '2026-10-01', to: '2026-10-31' })
        .expect(403);
      expect(res.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        code: 'FORBIDDEN',
        message: 'Für diese Anfrage fehlt die nötige Rolle.',
        errors: [],
        path: '/api/imports',
        timestamp: NOW,
        requestId: expect.stringMatching(REQUEST_ID),
        details: null,
      });
      expect((await request(server()).get('/api/imports').set(admin).expect(200)).body.meta.total).toBe(before);
    });

    it.each(['/api/imports', '/api/imports/1', '/api/gaps?from=2026-11-01&to=2026-11-19', '/api/auth/me'])(
      'GET %s → 403',
      async url => {
        expect((await request(server()).get(url).set(noRole).expect(403)).body.code).toBe('FORBIDDEN');
      },
    );

    it('GET /api/auth/me: Test-Token ohne Rolle → 403, Admin-Token aus dem Login → 200', async () => {
      await request(server()).get('/api/auth/me').set(noRole).expect(403);
      const login = await request(server()).post('/api/auth/tokens').send({ username: 'admin', password: PASSWORD }).expect(200);
      const me = await request(server()).get('/api/auth/me').set(authHeader(login.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ id: 1, username: 'admin', roles: ['admin'] });
    });

    it('Gast-Endpunkte bleiben ohne Token und mit Token ohne Rolle erreichbar', async () => {
      for (const url of ['/api/status', '/api/records', '/api/health', '/api/locations']) {
        await request(server()).get(url).expect(200);
        await request(server()).get(url).set(noRole).expect(200);
      }
    });
  });

  it('US10-3, US10-7: POST /api/imports als Admin → 202 mit Location; zweiter Auftrag während des Laufs → 409', async () => {
    hold();
    const created = await request(server())
      .post('/api/imports')
      .set(admin)
      .send({ kind: 'range', from: '2026-10-01', to: '2026-10-31' })
      .expect(202);
    const id = created.body.id as number;
    expect(created.headers['location']).toBe(`/api/imports/${id}`);
    expect(created.body).toMatchObject({ kind: 'range', status: 'queued', from: '2026-10-01', to: '2026-10-31' });

    const conflict = await request(server())
      .post('/api/imports')
      .set(admin)
      .send({ kind: 'range', from: '2026-10-01', to: '2026-10-02' })
      .expect(409);
    expect(conflict.body).toMatchObject({ code: 'IMPORT_RUNNING', details: { runningImportId: id } });

    release();
    await app.get(ImportRunner).whenIdle();
    expect((await request(server()).get(`/api/imports/${id}`).set(admin).expect(200)).body.status).toBe('succeeded');
  });

  it('US11-2: GET /api/imports?status=failed&page=1&limit=20 als Admin → 200 mit meta = { page, limit, total }', async () => {
    await request(server()).post('/api/imports').set(admin).send({ kind: 'range', from: '2026-08-10', to: '2026-08-11' }).expect(202);
    await app.get(ImportRunner).whenIdle();
    const res = await request(server()).get('/api/imports?status=failed&page=1&limit=20').set(admin).expect(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ status: 'failed', error: { code: 'UPSTREAM_ERROR' } });
  });

  it('US12-2: GET /api/gaps?from=2026-11-19&to=2026-11-01 als Admin → 400 to_before_from', async () => {
    const res = await request(server()).get('/api/gaps?from=2026-11-19&to=2026-11-01').set(admin).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', path: '/api/gaps' });
    expect(res.body.errors[0]).toMatchObject({ field: 'to', code: 'to_before_from' });
  });

  describe('C1 A02: Sicherheitsheader, kein X-Powered-By, CORS aus, Swagger aus', () => {
    it.each(['GET', 'HEAD'])('%s /api/status: nosniff, kein X-Powered-By, kein Access-Control-Allow-Origin (auch mit Origin)', async method => {
      const req = method === 'HEAD' ? request(server()).head('/api/status') : request(server()).get('/api/status');
      const res = await req.set('Origin', 'http://localhost:4200').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('auch Fehlerantworten (404, US17-3: GET /api/status mit Accept: text/html → 406) tragen die Header', async () => {
      for (const res of [
        await request(server()).get('/api/gibtsnicht').expect(404),
        await request(server()).get('/api/status').set('Accept', 'text/html').expect(406),
      ]) {
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-powered-by']).toBeUndefined();
      }
    });

    it('Preflight OPTIONS ohne CORS_ORIGINS → keine CORS-Freigabe', async () => {
      const res = await request(server())
        .options('/api/imports')
        .set('Origin', 'http://localhost:4200')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-methods']).toBeUndefined();
    });

    it('GET /api/docs bei SWAGGER_ENABLED=false (Standard) → 404 im Fehlerformat', async () => {
      const res = await request(server()).get('/api/docs').expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', path: '/api/docs' });
    });
  });

  it('C1 A09: Log-Ereignisse (Login, 401/403/429, Import) ohne Passwort, Token, Secret und IP', async () => {
    const lines: string[] = [];
    const capture = (level: string) => (message: unknown, ...rest: unknown[]) =>
      lines.push([level, message, ...rest].map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '));
    const logger: LoggerService = {
      log: capture('log'),
      warn: capture('warn'),
      error: capture('error'),
      debug: capture('debug'),
      verbose: capture('verbose'),
      fatal: capture('fatal'),
    };
    app.useLogger(logger);
    const login = (username: string, password: string) => request(server()).post('/api/auth/tokens').send({ username, password });

    const ok = await login('admin', PASSWORD).expect(200);
    const token = ok.body.accessToken as string;
    await login('admin', 'falsch-falsch-falsch').expect(401);
    await login('niemand\n[Nest] LOG gefälscht', PASSWORD).expect(401);
    await request(server()).get('/api/imports').expect(401);
    await request(server()).get('/api/imports').set(authHeader(`${token}x`)).expect(401);
    await request(server()).get('/api/imports').set(noRole).expect(403);
    await request(server()).get('/api/auth/me').set(authHeader(token)).expect(200);
    for (let i = 0; i < 2; i++) await login('admin', 'falsch-falsch-falsch').expect(401);
    await login('admin', PASSWORD).expect(429);
    await request(server()).post('/api/imports').set(admin).send({ kind: 'gaps', from: '2026-11-01', to: '2026-11-02' }).expect(202);
    await app.get(ImportRunner).whenIdle();
    await request(server()).post('/api/imports').set(admin).send({ kind: 'range', from: '2026-08-12', to: '2026-08-13' }).expect(202);
    await app.get(ImportRunner).whenIdle();

    const text = lines.join('\n');
    // Erwartete Ereignisse
    expect(text).toContain('Anmeldung erfolgreich: Benutzer "admin" (Konto 1)');
    expect(text).toContain('Anmeldung fehlgeschlagen: Benutzer "admin" (falsches Passwort)');
    expect(text).toContain('Anmeldung fehlgeschlagen: Benutzer "niemand [nest] log gefälscht" (unbekannter Benutzername)');
    expect(text).toMatch(/GET \/api\/imports → 401 UNAUTHENTICATED/);
    expect(text).toMatch(/GET \/api\/imports → 403 FORBIDDEN/);
    expect(text).toMatch(/POST \/api\/auth\/tokens → 429 TOO_MANY_REQUESTS/);
    expect(text).toMatch(/Import \d+ \(gaps 2026-11-01–2026-11-02\) gestartet/);
    expect(text).toMatch(/Import \d+ \(gaps 2026-11-01–2026-11-02\) fertig: succeeded/);
    expect(text).toMatch(/Import \d+ \(range 2026-08-12–2026-08-13\) fehlgeschlagen: UPSTREAM_ERROR/);
    // Nie im Log
    for (const secret of [PASSWORD, token, `${token}x`, noRole['Authorization'].slice(7), admin['Authorization'].slice(7), app.get(ConfigService).get('JWT_SECRET')]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/Bearer|\$2[aby]\$|password|falsch-falsch/i);
    expect(text).not.toMatch(/127\.0\.0\.1|::1|::ffff:/);
    // Log Injection: der Zeilenumbruch im Namen erzeugt keine eigene Zeile
    expect(lines.every(line => !line.includes('\n'))).toBe(true);
  });
});

describe('Schritt 11: globales Limit THROTTLE_GLOBAL_LIMIT (Standard 120 je 60 s und IP, C1 A06)', () => {
  it('121 Anfragen auf GET /api/records: die 121. → 429 TOO_MANY_REQUESTS mit Retry-After; das Limit gilt für alle Routen der IP', async () => {
    const { app } = await startApp({ config: { THROTTLE_GLOBAL_LIMIT: undefined } }); // Standard aus EnvSchema
    try {
      await seedApp(app, fixtureOf(dayObservations('2026-11-18')), NOW);
      expect(app.get(ConfigService).get('THROTTLE_GLOBAL_LIMIT')).toBe(120);
      for (let i = 1; i <= 120; i++) {
        const res = await request(app.getHttpServer()).get('/api/records');
        expect([i, res.status]).toEqual([i, 200]);
      }
      const blocked = await request(app.getHttpServer()).get('/api/records').expect(429);
      expect(blocked.body).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        code: 'TOO_MANY_REQUESTS',
        message: expect.any(String),
        errors: [],
        path: '/api/records',
        timestamp: NOW,
        requestId: expect.stringMatching(REQUEST_ID),
        details: null,
      });
      const retryAfter = Number(blocked.headers['retry-after']);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(blocked.headers['x-content-type-options']).toBe('nosniff');
      // Eine IP, ein Zähler: auch andere Routen (auch /api/health) sind jetzt gesperrt.
      await request(app.getHttpServer()).get('/api/status').expect(429);
      await request(app.getHttpServer()).get('/api/health').expect(429);
    } finally {
      await app.close();
    }
  });

  it('Login-Limit (6. Versuch) sendet jetzt auch Retry-After (offener Punkt aus Schritt 10)', async () => {
    const { app } = await startApp();
    try {
      const login = () => request(app.getHttpServer()).post('/api/auth/tokens').send({ username: 'admin', password: 'falsch-falsch-1' });
      for (let i = 0; i < 5; i++) await login().expect(401);
      const blocked = await login().expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(blocked.headers['retry-after-login'])).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it.each([
    ['loopback', 200],
    ['false', 429],
  ])('TRUST_PROXY=%s: X-Forwarded-For von 127.0.0.1 zählt als eigene Client-IP nur mit loopback', async (trustProxy, expected) => {
    const { app } = await startApp({ config: { THROTTLE_GLOBAL_LIMIT: '2', TRUST_PROXY: trustProxy } });
    try {
      const get = (ip: string) => request(app.getHttpServer()).get('/api/status').set('X-Forwarded-For', ip);
      await get('10.0.0.1').expect(200);
      await get('10.0.0.1').expect(200);
      await get('10.0.0.1').expect(429);
      await get('10.0.0.2').expect(expected);
    } finally {
      await app.close();
    }
  });
});

describe('Schritt 11: CORS nur mit CORS_ORIGINS (Freigabeliste)', () => {
  it('freigegebene Origin bekommt Access-Control-Allow-Origin, andere nicht; Preflight erlaubt Authorization', async () => {
    const { app } = await startApp({ config: { CORS_ORIGINS: 'http://localhost:4200, https://wetter.lan' } });
    try {
      const allowed = await request(app.getHttpServer()).get('/api/status').set('Origin', 'https://wetter.lan').expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://wetter.lan');
      expect(allowed.headers['access-control-allow-credentials']).toBeUndefined();
      const other = await request(app.getHttpServer()).get('/api/status').set('Origin', 'https://boese.example').expect(200);
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
      const preflight = await request(app.getHttpServer())
        .options('/api/imports')
        .set('Origin', 'http://localhost:4200')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);
      expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:4200');
      expect(preflight.headers['access-control-allow-headers']).toMatch(/Authorization/);
    } finally {
      await app.close();
    }
  });
});
