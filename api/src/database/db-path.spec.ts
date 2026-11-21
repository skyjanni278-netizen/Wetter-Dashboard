import path from 'node:path';
import { prepareDatabase } from './prepare-database';
import { resolveDbPath } from './db-path';

describe('resolveDbPath (03 B4.4, übergangsweise aus process.env)', () => {
  it('ohne DB_PATH: die Dev-DB unter %LOCALAPPDATA%\\wetter-heubach, nie die Sammel-DB', () => {
    const resolved = resolveDbPath({ LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }, 'C:\\Projekte\\api');
    expect(resolved).toBe(path.join('C:\\Users\\x\\AppData\\Local', 'wetter-heubach', 'weather.dev.db'));
    expect(resolved).not.toMatch(/weather\.db$/);
  });

  it('DB_PATH relativ zum Arbeitsverzeichnis; :memory: bleibt; Leerzeichen zählen als nicht gesetzt', () => {
    expect(resolveDbPath({ DB_PATH: 'data/x.db' }, '/srv/api')).toBe(path.resolve('/srv/api', 'data/x.db'));
    expect(resolveDbPath({ DB_PATH: ':memory:' })).toBe(':memory:');
    expect(resolveDbPath({ DB_PATH: '  ', LOCALAPPDATA: '/l' }, '/c')).toBe(path.join('/l', 'wetter-heubach', 'weather.dev.db'));
  });
});

describe('prepareDatabase (03 B4.4, B2.6)', () => {
  it('setzt WAL, foreign_keys, busy_timeout und synchronous in dieser Reihenfolge', () => {
    const pragmas: string[] = [];
    prepareDatabase({ pragma: (source: string) => pragmas.push(source) });
    expect(pragmas).toEqual(['journal_mode = WAL', 'foreign_keys = ON', 'busy_timeout = 5000', 'synchronous = NORMAL']);
  });
});
