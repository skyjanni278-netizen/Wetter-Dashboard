/**
 * Lädt echte historische Wetterdaten für Heubach von Open-Meteo und speichert
 * sie im gleichen Format wie der Scheduler (data/YYYY-MM/YYYY-MM-DD.json).
 *
 *   npm run backfill                      → ab 2025-01-01 bis heute
 *   npm run backfill -- 2024-06-01        → ab eigenem Startdatum
 *
 * Ältere Tage kommen aus der Archive-API (Reanalyse, ca. 5 Tage Verzug),
 * die letzten Tage aus der Forecast-API (past_days).
 */
import axios from 'axios';
import { DayData, HourlyEntry, fetchForecast } from './weather-api';
import { saveDayData, saveForecast } from './data-store';
import { berlinDate } from './berlin-date';

const LATITUDE = 48.7936;
const LONGITUDE = 9.9369;
const TIMEZONE = 'Europe/Berlin';
const HOURLY_VARS = 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m';
const RECENT_DAYS = 10; // diese Tage kommen aus der Forecast-API

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toEntries(raw: any): HourlyEntry[] {
  return raw.time.map((time: string, i: number) => ({
    time,
    temperature: raw.temperature_2m[i],
    apparentTemperature: raw.apparent_temperature[i],
    precipitation: raw.precipitation[i],
    weathercode: raw.weather_code[i],
    windspeed: raw.wind_speed_10m[i],
    winddirection: raw.wind_direction_10m[i],
  }));
}

function groupByDay(entries: HourlyEntry[]): Map<string, HourlyEntry[]> {
  const days = new Map<string, HourlyEntry[]>();
  for (const e of entries) {
    const date = e.time.slice(0, 10);
    if (!days.has(date)) days.set(date, []);
    days.get(date)!.push(e);
  }
  return days;
}

async function fetchArchive(start: string, end: string): Promise<HourlyEntry[]> {
  const res = await axios.get('https://archive-api.open-meteo.com/v1/archive', {
    params: { latitude: LATITUDE, longitude: LONGITUDE, timezone: TIMEZONE, hourly: HOURLY_VARS, start_date: start, end_date: end },
    timeout: 60_000,
  });
  return toEntries(res.data.hourly);
}

async function fetchRecent(): Promise<HourlyEntry[]> {
  const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: { latitude: LATITUDE, longitude: LONGITUDE, timezone: TIMEZONE, hourly: HOURLY_VARS, past_days: RECENT_DAYS + 1, forecast_days: 1 },
    timeout: 60_000,
  });
  return toEntries(res.data.hourly);
}

async function main(): Promise<void> {
  const startDate = process.argv[2] ?? '2025-01-01';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error(`Ungültiges Startdatum: ${startDate}`);

  const today = berlinDate(new Date());
  const recentStart = addDays(today, -RECENT_DAYS);
  const archiveEnd = addDays(recentStart, -1);

  const days = new Map<string, HourlyEntry[]>();

  if (startDate <= archiveEnd) {
    console.log(`Archiv: ${startDate} bis ${archiveEnd} …`);
    for (const [date, hours] of groupByDay(await fetchArchive(startDate, archiveEnd))) days.set(date, hours);
  }

  console.log(`Aktuelle Tage: ${recentStart > startDate ? recentStart : startDate} bis ${today} …`);
  for (const [date, hours] of groupByDay(await fetchRecent())) {
    if (date >= startDate && date >= recentStart && date <= today) days.set(date, hours);
  }

  let saved = 0;
  const incomplete: string[] = [];
  for (const [date, hourly] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (hourly.some(h => h.temperature == null)) incomplete.push(date);
    const data: DayData = { date, location: 'Heubach', hourly };
    saveDayData(data);
    saved++;
  }

  saveForecast(await fetchForecast());

  console.log(`\n${saved} Tage gespeichert (${startDate} bis ${today}), dazu forecast.json.`);
  if (incomplete.length) console.warn(`Achtung, Tage mit fehlenden Werten: ${incomplete.join(', ')}`);
}

main().catch(err => {
  console.error('Backfill fehlgeschlagen:', err instanceof Error ? err.message : err);
  process.exit(1);
});
