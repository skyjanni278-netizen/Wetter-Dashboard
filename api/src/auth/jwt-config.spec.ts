import { JwtConfigError, jwtConfig, jwtModuleOptions, parseExpiresIn } from './jwt-config';

const SECRET = 'x'.repeat(32);

/** Pflicht und Länge von `JWT_SECRET` beim Start prüft `EnvSchema` (`src/config/env.schema.spec.ts`). */
describe('JWT-Konfiguration (03 B4.6, B4.8)', () => {
  it('JWT_SECRET kürzer als 32 Zeichen → JwtConfigError ohne den Wert; genau 32 gültig', () => {
    expect(() => jwtConfig('geheim'.repeat(5))).toThrow(JwtConfigError);
    expect(() => jwtConfig('geheim'.repeat(5))).toThrow(/^JWT_SECRET ist zu kurz \(mindestens 32 Zeichen\)\.$/);
    expect(jwtConfig(SECRET)).toEqual({ secret: SECRET, expiresInSeconds: 3600 });
  });

  it('JWT_EXPIRES_IN: Standard 1h; Sekunden oder s/m/h/d; ungültig → Abbruch', () => {
    expect(jwtConfig(SECRET, '30m').expiresInSeconds).toBe(1800);
    expect(parseExpiresIn('3600')).toBe(3600);
    expect(parseExpiresIn('90s')).toBe(90);
    expect(parseExpiresIn('2h')).toBe(7200);
    expect(parseExpiresIn('1d')).toBe(86_400);
    expect(parseExpiresIn('0')).toBeNull();
    expect(parseExpiresIn('1 Stunde')).toBeNull();
    expect(parseExpiresIn('-1h')).toBeNull();
    expect(() => jwtConfig(SECRET, 'bald')).toThrow(/JWT_EXPIRES_IN ist ungültig/);
  });

  it('Modul-Optionen: HS256 fest beim Signieren und Prüfen, iss und aud gesetzt', () => {
    expect(jwtModuleOptions({ secret: SECRET, expiresInSeconds: 3600 })).toEqual({
      secret: SECRET,
      signOptions: { algorithm: 'HS256', expiresIn: 3600, issuer: 'wetter-heubach', audience: 'wetter-heubach-admin' },
      verifyOptions: { algorithms: ['HS256'], issuer: 'wetter-heubach', audience: 'wetter-heubach-admin' },
    });
  });
});
