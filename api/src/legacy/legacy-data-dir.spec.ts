import path from 'node:path';
import { resolveLegacyDataDir } from './legacy-data-dir';

describe('resolveLegacyDataDir', () => {
  const apiDir = path.resolve('/projekt/api');

  it('Standard ist ../backend/data relativ zum Arbeitsverzeichnis api/', () => {
    expect(resolveLegacyDataDir({}, apiDir)).toBe(path.resolve('/projekt/backend/data'));
  });

  it('leerer Wert gilt als nicht gesetzt', () => {
    expect(resolveLegacyDataDir({ LEGACY_DATA_DIR: '  ' }, apiDir)).toBe(path.resolve('/projekt/backend/data'));
  });

  it('relativer Wert wird gegen das Arbeitsverzeichnis aufgelöst', () => {
    expect(resolveLegacyDataDir({ LEGACY_DATA_DIR: 'fixtures/data' }, apiDir)).toBe(
      path.resolve('/projekt/api/fixtures/data'),
    );
  });

  it('absoluter Wert bleibt unverändert', () => {
    const absolute = path.resolve('/daten/wetter');
    expect(resolveLegacyDataDir({ LEGACY_DATA_DIR: absolute }, apiDir)).toBe(absolute);
  });
});
