import cron from 'node-cron';
import { fetchTodayData, fetchForecast } from './weather-api';
import { saveDayData, saveForecast } from './data-store';

let lastFetch: Date | null = null;
let lastStatus: 'ok' | 'error' = 'ok';
let lastError: string | null = null;

export function getSchedulerStatus() {
  return { lastFetch, lastStatus, lastError };
}

async function runFetch(): Promise<void> {
  try {
    const [data, forecast] = await Promise.all([fetchTodayData(), fetchForecast()]);
    saveDayData(data);
    saveForecast(forecast);
    lastFetch = new Date();
    lastStatus = 'ok';
    lastError = null;
    console.log(`[${lastFetch.toISOString()}] Wetterdaten und Vorhersage gespeichert für ${data.date}`);
  } catch (err) {
    lastStatus = 'error';
    lastError = err instanceof Error ? err.message : String(err);
    console.error(`Fehler beim Datenabruf:`, lastError);
  }
}

export function startScheduler(): void {
  // Sofortiger erster Abruf beim Start
  runFetch();

  // Jede volle Stunde
  cron.schedule('0 * * * *', runFetch, { timezone: 'Europe/Berlin' });
  console.log('Scheduler gestartet: stündlicher Abruf um :00');
}
