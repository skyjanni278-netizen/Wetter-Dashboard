import { JwtConfigError, jwtConfigFromEnv, jwtModuleOptions, parseExpiresIn } from './jwt-config';

const SECRET = 'x'.repeat(32);

describe('JWT-Konfiguration (03 B4.6, B4.8; Übergang aus process.env bis Schritt 11)', () => {
  it('JWT_SECRET fehlt oder leer → JwtConfigError mit Hinweis auf openssl', () => {
    expect(() => jwtConfigFromEnv({})).toThrow(JwtConfigError);
    expect(() => jwtConfigFromEnv({})).toThrow(/JWT_SECRET fehlt.*openssl rand -base64 48/);
    expect(() => jwtConfigFromEnv({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET fehlt/);
  });

  it('JWT_SECRET kürzer als 32 Zeichen → Abbruch mit Länge; genau 32 gültig', () => {
    expect(() => jwtConfigFromEnv({ JWT_SECRET: 'x'.repeat(31) })).toThrow(/zu kurz \(31 Zeichen, mindestens 32\)/);
    expect(jwtConfigFromEnv({ JWT_SECRET: SECRET })).toEqual({ secret: SECRET, expiresInSeconds: 3600 });
  });

  it('JWT_EXPIRES_IN: Standard 1h; Sekunden oder s/m/h/d; ungültig → Abbruch', () => {
    expect(jwtConfigFromEnv({ JWT_SECRET: SECRET, JWT_EXPIRES_IN: '30m' }).expiresInSeconds).toBe(1800);
    expect(jwtConfigFromEnv({ JWT_SECRET: SECRET, JWT_EXPIRES_IN: '' }).expiresInSeconds).toBe(3600);
    expect(parseExpiresIn('3600')).toBe(3600);
    expect(parseExpiresIn('90s')).toBe(90);
    expect(parseExpiresIn('2h')).toBe(7200);
    expect(parseExpiresIn('1d')).toBe(86_400);
    expect(parseExpiresIn('0')).toBeNull();
    expect(parseExpiresIn('1 Stunde')).toBeNull();
    expect(parseExpiresIn('-1h')).toBeNull();
    expect(() => jwtConfigFromEnv({ JWT_SECRET: SECRET, JWT_EXPIRES_IN: 'bald' })).toThrow(/JWT_EXPIRES_IN="bald" ist ungültig/);
  });

  it('Modul-Optionen: HS256 fest beim Signieren und Prüfen, iss und aud gesetzt', () => {
    expect(jwtModuleOptions({ secret: SECRET, expiresInSeconds: 3600 })).toEqual({
      secret: SECRET,
      signOptions: { algorithm: 'HS256', expiresIn: 3600, issuer: 'wetter-heubach', audience: 'wetter-heubach-admin' },
      verifyOptions: { algorithms: ['HS256'], issuer: 'wetter-heubach', audience: 'wetter-heubach-admin' },
    });
  });
});
