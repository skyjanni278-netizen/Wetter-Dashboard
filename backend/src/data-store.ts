import fs from 'fs';
import path from 'path';
import { DayData, HourlyEntry, DayForecast } from './weather-api';

const DATA_DIR = path.join(__dirname, '..', 'data');
const FORECAST_FILE = path.join(DATA_DIR, 'forecast.json');

export interface MonthSummary {
  day: number;
  avgTemp: number;
  totalPrecip: number;
}

export interface YearSummary {
  month: number;
  avgTemp: number;
  totalPrecip: number;
}

function getDayFilePath(date: string): string {
  const [year, month] = date.split('-');
  const monthDir = path.join(DATA_DIR, `${year}-${month}`);
  return path.join(monthDir, `${date}.json`);
}

export function saveDayData(data: DayData): void {
  const [year, month] = data.date.split('-');
  const monthDir = path.join(DATA_DIR, `${year}-${month}`);
  if (!fs.existsSync(monthDir)) {
    fs.mkdirSync(monthDir, { recursive: true });
  }
  const filePath = path.join(monthDir, `${data.date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadDayData(date: string): DayData | null {
  const filePath = getDayFilePath(date);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as DayData;
  } catch {
    return null;
  }
}

export function getMonthSummary(year: string, month: string): MonthSummary[] {
  const monthDir = path.join(DATA_DIR, `${year}-${month}`);
  if (!fs.existsSync(monthDir)) return [];

  const files = fs.readdirSync(monthDir).filter(f => f.endsWith('.json'));
  const result: MonthSummary[] = [];

  for (const file of files.sort()) {
    let data: DayData;
    try {
      data = JSON.parse(fs.readFileSync(path.join(monthDir, file), 'utf-8')) as DayData;
    } catch { continue; }
    const day = parseInt(data.date.split('-')[2], 10);
    const validHours = data.hourly.filter((h: HourlyEntry) => h.temperature !== null);
    if (validHours.length === 0) continue;
    const avgTemp = validHours.reduce((s: number, h: HourlyEntry) => s + h.temperature, 0) / validHours.length;
    const totalPrecip = data.hourly.reduce((s: number, h: HourlyEntry) => s + (h.precipitation ?? 0), 0);
    result.push({ day, avgTemp: Math.round(avgTemp * 10) / 10, totalPrecip: Math.round(totalPrecip * 10) / 10 });
  }

  return result;
}

export function getYearSummary(year: string): YearSummary[] {
  const result: YearSummary[] = [];

  for (let m = 1; m <= 12; m++) {
    const month = String(m).padStart(2, '0');
    const monthDir = path.join(DATA_DIR, `${year}-${month}`);
    if (!fs.existsSync(monthDir)) continue;

    const files = fs.readdirSync(monthDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) continue;

    let allTemps: number[] = [];
    let totalPrecip = 0;

    for (const file of files) {
      let data: DayData;
      try {
        data = JSON.parse(fs.readFileSync(path.join(monthDir, file), 'utf-8')) as DayData;
      } catch { continue; }
      const validHours = data.hourly.filter((h: HourlyEntry) => h.temperature !== null);
      allTemps = allTemps.concat(validHours.map((h: HourlyEntry) => h.temperature));
      totalPrecip += data.hourly.reduce((s: number, h: HourlyEntry) => s + (h.precipitation ?? 0), 0);
    }

    if (allTemps.length === 0) continue;
    const avgTemp = allTemps.reduce((s, t) => s + t, 0) / allTemps.length;
    result.push({ month: m, avgTemp: Math.round(avgTemp * 10) / 10, totalPrecip: Math.round(totalPrecip * 10) / 10 });
  }

  return result;
}

export function saveForecast(data: DayForecast[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FORECAST_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadForecast(): DayForecast[] | null {
  if (!fs.existsSync(FORECAST_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(FORECAST_FILE, 'utf-8')) as DayForecast[];
  } catch {
    return null;
  }
}

export function countStoredDays(): number {
  if (!fs.existsSync(DATA_DIR)) return 0;
  let count = 0;
  for (const dir of fs.readdirSync(DATA_DIR)) {
    const monthDir = path.join(DATA_DIR, dir);
    if (fs.statSync(monthDir).isDirectory()) {
      count += fs.readdirSync(monthDir).filter(f => f.endsWith('.json')).length;
    }
  }
  return count;
}

export interface StatsRecord {
  date: string;
  value: number;
}

export interface Stats {
  hottestDay: StatsRecord | null;
  coldestDay: StatsRecord | null;
  rainiestDay: StatsRecord | null;
  driestStreak: { days: number; from: string; to: string } | null;
  totalDays: number;
}

export function getStats(): Stats {
  if (!fs.existsSync(DATA_DIR)) {
    return { hottestDay: null, coldestDay: null, rainiestDay: null, driestStreak: null, totalDays: 0 };
  }

  let hottestDay: StatsRecord | null = null;
  let coldestDay: StatsRecord | null = null;
  let rainiestDay: StatsRecord | null = null;

  const allDates: { date: string; precip: number }[] = [];

  for (const monthDir of fs.readdirSync(DATA_DIR).sort()) {
    const fullMonthDir = path.join(DATA_DIR, monthDir);
    if (!fs.statSync(fullMonthDir).isDirectory()) continue;

    for (const file of fs.readdirSync(fullMonthDir).filter(f => f.endsWith('.json')).sort()) {
      let data: DayData;
      try {
        data = JSON.parse(fs.readFileSync(path.join(fullMonthDir, file), 'utf-8')) as DayData;
      } catch { continue; }
      const validHours = data.hourly.filter(h => h.temperature != null);
      if (validHours.length === 0) continue;

      const maxTemp = Math.max(...validHours.map(h => h.temperature));
      const minTemp = Math.min(...validHours.map(h => h.temperature));
      const totalPrecip = data.hourly.reduce((s, h) => s + (h.precipitation ?? 0), 0);

      if (!hottestDay || maxTemp > hottestDay.value) hottestDay = { date: data.date, value: Math.round(maxTemp * 10) / 10 };
      if (!coldestDay || minTemp < coldestDay.value) coldestDay = { date: data.date, value: Math.round(minTemp * 10) / 10 };
      if (!rainiestDay || totalPrecip > rainiestDay.value) rainiestDay = { date: data.date, value: Math.round(totalPrecip * 10) / 10 };

      allDates.push({ date: data.date, precip: totalPrecip });
    }
  }

  // Längste Trockenperiode
  let driestStreak: { days: number; from: string; to: string } | null = null;
  let currentStreak = 0;
  let streakStart = '';
  for (const { date, precip } of allDates) {
    if (precip < 0.1) {
      if (currentStreak === 0) streakStart = date;
      currentStreak++;
      if (!driestStreak || currentStreak > driestStreak.days) {
        driestStreak = { days: currentStreak, from: streakStart, to: date };
      }
    } else {
      currentStreak = 0;
    }
  }

  return { hottestDay, coldestDay, rainiestDay, driestStreak, totalDays: allDates.length };
}
