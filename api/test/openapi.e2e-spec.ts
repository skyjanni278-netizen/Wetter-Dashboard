import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clock, FixedClock } from '../src/common/clock';
import { createTestApp } from './support/app';

/** Alle Nest-Pfade aus 03 B3.1, die es bis Schritt 10 gibt (OpenAPI-Schreibweise), mit ihren Methoden. */
const EXPECTED_PATHS: Record<string, string[]> = {
  '/api/days': ['get'],
  '/api/days/today': ['get'],
  '/api/days/{date}': ['get'],
  '/api/forecasts': ['get'],
  '/api/summaries/months': ['get'],
  '/api/summaries/months/{yearMonth}': ['get'],
  '/api/summaries/years': ['get'],
  '/api/summaries/years/{year}': ['get'],
  '/api/records': ['get'],
  '/api/status': ['get'],
  '/api/locations': ['get'],
  '/api/locations/{id}': ['get'],
  '/api/imports': ['get', 'post'],
  '/api/imports/{id}': ['get'],
  '/api/gaps': ['get'],
  '/api/health': ['get'],
  '/api/auth/tokens': ['post'],
  '/api/auth/me': ['get'],
};

/** Geschützte Operationen (ohne `@Public()`, Schritt 10): Schloss `bearer` und 401 in der Doku. */
const PROTECTED = ['get /api/imports', 'post /api/imports', 'get /api/imports/{id}', 'get /api/gaps', 'get /api/auth/me'];

/** App wie `main.ts` mit leerer Datenbank (`:memory:`, Schema über die Migrationen). */
async function start(env: NodeJS.ProcessEnv) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(new FixedClock('2026-11-19T13:30:00Z'))
    .compile();
  const app = await createTestApp(moduleRef, env);
  return {
    app,
    close: () => app.close(),
  };
}

describe('OpenAPI (B3.7) mit SWAGGER_ENABLED=true', () => {
  let app: INestApplication<App>;
  let close: () => Promise<void>;
  let doc: Record<string, any>;

  beforeAll(async () => {
    ({ app, close } = await start({ SWAGGER_ENABLED: 'true' }));
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    doc = res.body as Record<string, any>;
  });
  afterAll(() => close());

  it('GET /api/docs-json → OpenAPI 3.x mit Bearer-Auth', () => {
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('enthält genau die Nest-Pfade aus B3.1 mit ihren Methoden', () => {
    const paths = Object.fromEntries(
      Object.entries(doc.paths as Record<string, object>).map(([p, ops]) => [p, Object.keys(ops).sort()]),
    );
    expect(paths).toEqual(Object.fromEntries(Object.entries(EXPECTED_PATHS).map(([p, m]) => [p, [...m].sort()])));
  });

  it('jeder Endpunkt: Erfolgsschema und Fehlerantworten mit dem Fehlerschema (406 und 500 immer)', () => {
    for (const [p, ops] of Object.entries(doc.paths as Record<string, Record<string, any>>)) {
      for (const [method, op] of Object.entries(ops)) {
        const statuses = Object.keys(op.responses);
        const success = statuses.find(s => s.startsWith('2'));
        expect([p, method, success]).toEqual([p, method, expect.any(String)]);
        expect(op.responses[success!].content['application/json'].schema.type).toBe('object');
        for (const status of ['406', '500']) expect([p, method, statuses]).toEqual([p, method, expect.arrayContaining([status])]);
        for (const status of statuses.filter(s => !s.startsWith('2'))) {
          expect(op.responses[status].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/ApiError' });
        }
      }
    }
    expect(doc.components.schemas.ApiError.required).toEqual(
      expect.arrayContaining(['statusCode', 'code', 'message', 'errors', 'path', 'timestamp', 'requestId', 'details']),
    );
  });

  it('Schritt 10: geschützte Routen mit security bearer und 401, Gast-Routen ohne', () => {
    const secured: string[] = [];
    for (const [p, ops] of Object.entries(doc.paths as Record<string, Record<string, any>>)) {
      for (const [method, op] of Object.entries(ops)) {
        const key = `${method} ${p}`;
        if (op.security) {
          secured.push(key);
          expect([key, op.security]).toEqual([key, [{ bearer: [] }]]);
          expect([key, Object.keys(op.responses)]).toEqual([key, expect.arrayContaining(['401'])]);
        } else if (key !== 'post /api/auth/tokens') {
          expect([key, Object.keys(op.responses)]).toEqual([key, expect.not.arrayContaining(['401'])]);
        }
      }
    }
    expect(secured.sort()).toEqual([...PROTECTED].sort());
    // Login: 401 nur als INVALID_CREDENTIALS (öffentlich), 429 dokumentiert.
    expect(Object.keys(doc.paths['/api/auth/tokens'].post.responses)).toEqual(expect.arrayContaining(['200', '400', '401', '415', '429']));
  });

  it('Parameter und Body kommen aus den Zod-Schemas', () => {
    const days = doc.paths['/api/days'].get.parameters;
    expect(days.map((p: any) => [p.in, p.name, p.required])).toEqual([
      ['query', 'from', true],
      ['query', 'to', true],
    ]);
    const imports = doc.paths['/api/imports'].get.parameters;
    expect(imports.find((p: any) => p.name === 'limit').schema).toMatchObject({ type: 'integer', minimum: 1, maximum: 100, default: 20 });
    expect(doc.paths['/api/summaries/months'].get.parameters[0]).toMatchObject({ in: 'query', name: 'year', required: true });
    expect(doc.paths['/api/days/{date}'].get.parameters[0]).toMatchObject({ in: 'path', name: 'date', required: true });
    const body = doc.paths['/api/imports'].post.requestBody.content['application/json'].schema;
    expect(body).toMatchObject({ type: 'object', required: ['kind', 'from', 'to'], additionalProperties: false });
    expect(doc.paths['/api/imports'].post.responses['202']).toBeDefined();
    const login = doc.paths['/api/auth/tokens'].post.requestBody.content['application/json'].schema;
    expect(login).toMatchObject({ type: 'object', required: ['username', 'password'], additionalProperties: false });
    expect(login.properties.username).toMatchObject({ type: 'string', minLength: 3, maxLength: 50 });
    const token = doc.paths['/api/auth/tokens'].post.responses['200'].content['application/json'].schema;
    expect(Object.keys(token.properties)).toEqual(['accessToken', 'tokenType', 'expiresIn', 'user']);
  });

  it('GET /api/docs/ mit Accept: text/html → 200 HTML, kein 406 (B3.1)', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs/').set('Accept', 'text/html').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}$/);
  });

  it('andere Pfade prüfen Accept weiter (406)', async () => {
    const res = await request(app.getHttpServer()).get('/api/status').set('Accept', 'text/html').expect(406);
    expect(res.body.code).toBe('NOT_ACCEPTABLE');
  });
});

describe('OpenAPI ohne SWAGGER_ENABLED', () => {
  it.each([{}, { SWAGGER_ENABLED: 'TRUE' }, { SWAGGER_ENABLED: '1' }])('env %j → /api/docs-json und /api/docs 404 als JSON', async env => {
    const h = await start(env);
    try {
      const json = await request(h.app.getHttpServer()).get('/api/docs-json').expect(404);
      expect(json.body.code).toBe('NOT_FOUND');
      await request(h.app.getHttpServer()).get('/api/docs').expect(404);
    } finally {
      await h.close();
    }
  });
});
