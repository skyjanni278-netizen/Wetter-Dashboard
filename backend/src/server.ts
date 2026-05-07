import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { startScheduler, getSchedulerStatus } from './scheduler';
import { loadDayData, loadForecast, getMonthSummary, getYearSummary, countStoredDays, getStats } from './data-store';

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/status', (_req, res) => {
  const status = getSchedulerStatus();
  res.json({
    lastFetch: status.lastFetch,
    lastStatus: status.lastStatus,
    lastError: status.lastError,
    storedDays: countStoredDays(),
  });
});

app.get('/api/data/today', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const data = loadDayData(today);
  if (!data) {
    res.status(404).json({ error: 'Keine Daten für heute gefunden. Warte auf ersten Abruf.' });
    return;
  }
  res.json(data);
});

app.get('/api/data/day/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'Ungültiges Datumsformat. Erwartet: YYYY-MM-DD' });
    return;
  }
  const data = loadDayData(date);
  if (!data) {
    res.status(404).json({ error: `Keine Daten für ${date} gefunden.` });
    return;
  }
  res.json(data);
});

app.get('/api/data/month/:year/:month', (req, res) => {
  const { year, month } = req.params;
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Ungültige Parameter. Erwartet: /year/MM' });
    return;
  }
  res.json({ year, month, data: getMonthSummary(year, month) });
});

app.get('/api/data/year/:year', (req, res) => {
  const { year } = req.params;
  if (!/^\d{4}$/.test(year)) {
    res.status(400).json({ error: 'Ungültiges Jahr. Erwartet: YYYY' });
    return;
  }
  res.json({ year, data: getYearSummary(year) });
});

app.get('/api/forecast', (_req, res) => {
  const forecast = loadForecast();
  if (!forecast) {
    res.status(404).json({ error: 'Noch keine Vorhersagedaten verfügbar. Warte auf ersten Abruf.' });
    return;
  }
  res.json(forecast);
});

app.get('/api/stats', (_req, res) => {
  res.json(getStats());
});

startScheduler();

app.listen(PORT, () => {
  console.log(`Wetter-Dashboard Backend läuft auf http://localhost:${PORT}`);
});
