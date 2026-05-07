import axios from 'axios';

const LATITUDE = 48.7936;
const LONGITUDE = 9.9369;
const TIMEZONE = 'Europe/Berlin';

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

export interface DayForecast {
  date: string;
  maxTemp: number;
  minTemp: number;
  precipitation: number;
  weathercode: number;
}

export async function fetchDayData(date: string): Promise<DayData> {
  const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: LATITUDE,
      longitude: LONGITUDE,
      hourly: 'temperature_2m,apparent_temperature,precipitation,weathercode,windspeed_10m,winddirection_10m',
      timezone: TIMEZONE,
      start_date: date,
      end_date: date,
    },
  });

  const raw = response.data.hourly;
  const hourly: HourlyEntry[] = raw.time.map((time: string, i: number) => ({
    time,
    temperature: raw.temperature_2m[i],
    apparentTemperature: raw.apparent_temperature[i],
    precipitation: raw.precipitation[i],
    weathercode: raw.weathercode[i],
    windspeed: raw.windspeed_10m[i],
    winddirection: raw.winddirection_10m[i],
  }));

  return { date, location: 'Heubach', hourly };
}

export async function fetchTodayData(): Promise<DayData> {
  const today = new Date().toISOString().slice(0, 10);
  return fetchDayData(today);
}

export async function fetchForecast(): Promise<DayForecast[]> {
  const today = new Date().toISOString().slice(0, 10);
  const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: {
      latitude: LATITUDE,
      longitude: LONGITUDE,
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode',
      timezone: TIMEZONE,
      start_date: today,
      forecast_days: 7,
    },
  });

  const raw = response.data.daily;
  return raw.time.map((date: string, i: number) => ({
    date,
    maxTemp: raw.temperature_2m_max[i],
    minTemp: raw.temperature_2m_min[i],
    precipitation: raw.precipitation_sum[i],
    weathercode: raw.weathercode[i],
  }));
}
