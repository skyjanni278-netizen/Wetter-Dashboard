import {
  fakeFetch,
  forecastDays,
  jsonResponse,
  openMeteoDailyBody,
  openMeteoHourlyBody,
  providerHours,
} from '../../test/support/fakes';
import { OpenMeteoClient, OpenMeteoError } from './open-meteo.client';
import type { HourlyRequest } from './open-meteo.client';

const HEUBACH = { latitude: 48.7936, longitude: 9.9369 };
const ARCHIVE: HourlyRequest = { source: 'archive', startDate: '2026-09-30', endDate: '2026-10-03' };

async function expectError(promise: Promise<unknown>, code: string): Promise<OpenMeteoError> {
  const error = await promise.then(
    () => {
      throw new Error('Fehler erwartet');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(OpenMeteoError);
  expect((error as OpenMeteoError).code).toBe(code);
  return error as OpenMeteoError;
}

describe('OpenMeteoClient (S7, R32)', () => {
  it('fragt mit timezone=GMT und dem einen Variablen-Mapping ab und liefert UTC-Zeitpunkte', async () => {
    const hours = providerHours('2026-09-30T00:00:00Z', 3, i => (i === 1 ? { temperature: null } : {}));
    const fetch = fakeFetch({ hourly: () => jsonResponse(openMeteoHourlyBody(hours)) });
    const client = new OpenMeteoClient(fetch, []);

    const result = await client.fetchHourly(ARCHIVE, HEUBACH);

    expect(result).toEqual(hours);
    expect(result[0].timeUtc).toBe('2026-09-30T00:00:00Z');
    expect(result[1].temperature).toBeNull();
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(url.searchParams.get('timezone')).toBe('GMT');
    expect(url.searchParams.get('hourly')).toBe(
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    );
    expect(url.searchParams.get('start_date')).toBe('2026-09-30');
    expect(url.searchParams.get('end_date')).toBe('2026-10-03');
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('nutzt für source "forecast" die Forecast-API', async () => {
    const fetch = fakeFetch({ hourly: () => jsonResponse(openMeteoHourlyBody(providerHours('2026-11-19T00:00:00Z', 1))) });
    await new OpenMeteoClient(fetch, []).fetchHourly({ ...ARCHIVE, source: 'forecast' }, HEUBACH);
    expect(String(fetch.mock.calls[0][0])).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  });

  it('R32: gültiges JSON ohne hourly ({}) → UPSTREAM_INVALID', async () => {
    const client = new OpenMeteoClient(fakeFetch({ hourly: () => jsonResponse({}) }), []);
    await expectError(client.fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_INVALID');
  });

  it('R32: Arrays ungleich lang → UPSTREAM_INVALID mit Feldname', async () => {
    const body = openMeteoHourlyBody(providerHours('2026-09-30T00:00:00Z', 3));
    (body['hourly'] as Record<string, unknown[]>)['wind_speed_10m'].pop();
    const client = new OpenMeteoClient(fakeFetch({ hourly: () => jsonResponse(body) }), []);
    const error = await expectError(client.fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_INVALID');
    expect(error.message).toContain('wind_speed_10m');
  });

  it('R32: utc_offset_seconds ≠ 0 → UPSTREAM_INVALID', async () => {
    const body = { ...openMeteoHourlyBody(providerHours('2026-09-30T00:00:00Z', 3)), utc_offset_seconds: 7200 };
    const client = new OpenMeteoClient(fakeFetch({ hourly: () => jsonResponse(body) }), []);
    const error = await expectError(client.fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_INVALID');
    expect(error.message).toContain('utc_offset_seconds');
  });

  it('R32: kein JSON → UPSTREAM_INVALID ohne Wiederholung', async () => {
    const fetch = fakeFetch({ hourly: () => new Response('<html>Fehler</html>', { status: 200 }) });
    await expectError(new OpenMeteoClient(fetch, [0, 0]).fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_INVALID');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('R32: Zeitstempel mit Offset → UPSTREAM_INVALID', async () => {
    const body = openMeteoHourlyBody(providerHours('2026-09-30T00:00:00Z', 1));
    (body['hourly'] as Record<string, unknown[]>)['time'] = ['2026-09-30T00:00+02:00'];
    const client = new OpenMeteoClient(fakeFetch({ hourly: () => jsonResponse(body) }), []);
    await expectError(client.fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_INVALID');
  });

  it('wiederholt bei HTTP 503 zweimal und liefert dann das Ergebnis', async () => {
    const ok = openMeteoHourlyBody(providerHours('2026-09-30T00:00:00Z', 2));
    let calls = 0;
    const fetch = fakeFetch({ hourly: () => (++calls < 3 ? jsonResponse({ error: true }, 503) : jsonResponse(ok)) });
    const result = await new OpenMeteoClient(fetch, [0, 0]).fetchHourly(ARCHIVE, HEUBACH);
    expect(result).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('gibt nach 2 Wiederholungen auf (UPSTREAM_ERROR)', async () => {
    const fetch = fakeFetch({ hourly: () => jsonResponse({ error: true }, 500) });
    await expectError(new OpenMeteoClient(fetch, [0, 0]).fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_ERROR');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('wiederholt HTTP 400 nicht', async () => {
    const fetch = fakeFetch({ hourly: () => jsonResponse({ error: true, reason: 'x' }, 400) });
    await expectError(new OpenMeteoClient(fetch, [0, 0]).fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_ERROR');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('Zeitüberschreitung → UPSTREAM_TIMEOUT nach Wiederholungen', async () => {
    const fetch = fakeFetch({
      hourly: () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    });
    const error = await expectError(new OpenMeteoClient(fetch, [0, 0]).fetchHourly(ARCHIVE, HEUBACH), 'UPSTREAM_TIMEOUT');
    expect(error.message).toBe('Open-Meteo antwortete nicht innerhalb von 15 s');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('Tagesvorhersage: daily mit timezone=Europe/Berlin (Berliner Tage) und forecast_days=7', async () => {
    const days = forecastDays('2026-11-20');
    const fetch = fakeFetch({ daily: () => jsonResponse(openMeteoDailyBody(days)) });
    const result = await new OpenMeteoClient(fetch, []).fetchDailyForecast(HEUBACH);
    expect(result).toEqual(days);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get('timezone')).toBe('Europe/Berlin');
    expect(url.searchParams.get('forecast_days')).toBe('7');
    expect(url.searchParams.get('daily')).toBe('temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code');
  });

  it.each([3600, 7200])('Tagesvorhersage mit utc_offset_seconds %i (MEZ/MESZ) ist gültig', async offset => {
    const fetch = fakeFetch({ daily: () => jsonResponse(openMeteoDailyBody(forecastDays('2026-07-20'), offset)) });
    await expect(new OpenMeteoClient(fetch, []).fetchDailyForecast(HEUBACH)).resolves.toHaveLength(7);
  });

  it.each([0, 3601])('Tagesvorhersage mit utc_offset_seconds %i → UPSTREAM_INVALID', async offset => {
    const fetch = fakeFetch({ daily: () => jsonResponse(openMeteoDailyBody(forecastDays('2026-11-20'), offset)) });
    const error = await expectError(new OpenMeteoClient(fetch, []).fetchDailyForecast(HEUBACH), 'UPSTREAM_INVALID');
    expect(error.message).toContain('utc_offset_seconds');
  });

  it('Tagesvorhersage ohne daily → UPSTREAM_INVALID', async () => {
    const client = new OpenMeteoClient(fakeFetch({ daily: () => jsonResponse({ utc_offset_seconds: 3600 }) }), []);
    await expectError(client.fetchDailyForecast(HEUBACH), 'UPSTREAM_INVALID');
  });
});
