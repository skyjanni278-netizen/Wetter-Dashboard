import path from 'node:path';
import { prepareDatabase } from './prepare-database';
import { resolveDbPath } from './db-path';

describe('resolveDbPath (03 B4.4; DB_PATH ist seit Schritt 11 Pflicht im EnvSchema)', () => {
  it('absoluter Pfad bleibt (normalisiert); relativ gilt ab dem Arbeitsverzeichnis; :memory: bleibt; Leerzeichen am Rand fallen weg', () => {
    expect(resolveDbPath('C:\\Users\\x\\AppData\\Local\\wetter-heubach\\weather.dev.db', 'C:\\Projekte\\api')).toBe(
      path.resolve('C:\\Users\\x\\AppData\\Local\\wetter-heubach\\weather.dev.db'),
    );
    expect(resolveDbPath('data/x.db', '/srv/api')).toBe(path.resolve('/srv/api', 'data/x.db'));
    expect(resolveDbPath(':memory:')).toBe(':memory:');
    expect(resolveDbPath('  data/x.db ', '/srv/api')).toBe(path.resolve('/srv/api', 'data/x.db'));
  });
});

describe('prepareDatabase (03 B4.4, B2.6)', () => {
  it('setzt WAL, foreign_keys, busy_timeout und synchronous in dieser Reihenfolge', () => {
    const pragmas: string[] = [];
    prepareDatabase({ pragma: (source: string) => pragmas.push(source) });
    expect(pragmas).toEqual(['journal_mode = WAL', 'foreign_keys = ON', 'busy_timeout = 5000', 'synchronous = NORMAL']);
  });
});
