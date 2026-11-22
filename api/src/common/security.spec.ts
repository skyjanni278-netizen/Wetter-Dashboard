import { logText } from './log-text';
import { corsOptions, parseCorsOrigins, trustProxySetting } from './security';

describe('TRUST_PROXY → Express trust proxy (03 B4.8)', () => {
  it.each([
    ['loopback', 'loopback'],
    ['true', true],
    ['false', false],
    ['', false],
    ['1', 1],
    [' 2 ', 2],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
  ])('%p → %p', (value, expected) => {
    expect(trustProxySetting(value)).toEqual(expected);
  });
});

describe('CORS_ORIGINS (03 B4.8)', () => {
  it('leer oder nicht gesetzt → keine Origin (CORS aus)', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins(' , ')).toEqual([]);
  });

  it('Komma-Liste, Leerzeichen fallen weg', () => {
    expect(parseCorsOrigins('http://localhost:4200, https://wetter.lan ')).toEqual(['http://localhost:4200', 'https://wetter.lan']);
  });

  it('Optionen: nur die Liste, keine Cookies, Header für Token, ETag und Location', () => {
    expect(corsOptions(['https://wetter.lan'])).toMatchObject({
      origin: ['https://wetter.lan'],
      credentials: false,
      allowedHeaders: expect.arrayContaining(['Authorization', 'If-Match']),
      exposedHeaders: expect.arrayContaining(['ETag', 'Location', 'Retry-After']),
    });
  });
});

describe('logText (C1 A05, Log Injection)', () => {
  it('Zeilenumbrüche und Steuerzeichen werden zu Leerzeichen, Text bleibt', () => {
    expect(logText('admin\r\n[Nest] LOG gefälscht')).toBe('admin  [Nest] LOG gefälscht');
    expect(logText(`a${String.fromCharCode(0x2028)}b\tc${String.fromCharCode(0)}d`)).toBe('a b c d');
    expect(logText('normal')).toBe('normal');
  });

  it('lange Werte werden gekürzt', () => {
    expect(logText('x'.repeat(500))).toHaveLength(101);
  });
});
