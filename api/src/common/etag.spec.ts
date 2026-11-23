import { ApiException } from './api.exception';
import { etagOf, ifMatchVersions } from './etag';

describe('ETag und If-Match (03 B3.4, R17)', () => {
  it('etagOf: starkes ETag aus der Version', () => {
    expect(etagOf(3)).toBe('"3"');
  });

  it.each([undefined, '', '   ', '*'])('If-Match %j → 428 PRECONDITION_REQUIRED', header => {
    try {
      ifMatchVersions(header);
      throw new Error('kein Fehler');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).payload).toMatchObject({ statusCode: 428, code: 'PRECONDITION_REQUIRED' });
    }
  });

  it('starke Tags mit Versionsnummer, auch als Liste; schwache oder ohne Anführungszeichen passen nie', () => {
    expect(ifMatchVersions('"3"')).toEqual([3]);
    expect(ifMatchVersions(' "3" , "4"')).toEqual([3, 4]);
    expect(ifMatchVersions('W/"3"')).toEqual([]);
    expect(ifMatchVersions('3')).toEqual([]);
    expect(ifMatchVersions('"abc"')).toEqual([]);
  });
});
