export interface HourlyEntry {
  time: string;
  temperature: number;
  apparentTemperature: number;
  precipitation: number;
  weathercode: number;
  windspeed: number;
  winddirection: number;
}

export interface DayData {
  date: string;
  location: string;
  hourly: HourlyEntry[];
}

export interface MonthSummary {
  day: number;
  avgTemp: number;
  totalPrecip: number;
}

export interface MonthResponse {
  year: string;
  month: string;
  data: MonthSummary[];
}

export interface YearSummary {
  month: number;
  avgTemp: number;
  totalPrecip: number;
}

export interface YearResponse {
  year: string;
  data: YearSummary[];
}

export interface StatusResponse {
  lastFetch: string | null;
  lastStatus: 'ok' | 'error';
  lastError: string | null;
  storedDays: number;
}

export interface DayForecast {
  date: string;
  maxTemp: number;
  minTemp: number;
  precipitation: number;
  weathercode: number;
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
