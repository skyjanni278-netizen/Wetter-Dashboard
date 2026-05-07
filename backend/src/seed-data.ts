import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

interface HourlyEntry {
  time: string;
  temperature: number;
  precipitation: number;
  weathercode: number;
}

interface DayData {
  date: string;
  location: string;
  hourly: HourlyEntry[];
}

// Realistisches Temperaturprofil: kalt nachts, warm nachmittags
function tempCurve(hour: number, minTemp: number, maxTemp: number): number {
  // Tiefstwert um 5 Uhr, Höchstwert um 14 Uhr
  const rad = ((hour - 5) / 24) * 2 * Math.PI;
  const factor = (1 - Math.cos(rad)) / 2;
  const raw = minTemp + factor * (maxTemp - minTemp);
  return Math.round(raw * 10) / 10;
}

function jitter(val: number, range: number): number {
  return Math.round((val + (Math.random() - 0.5) * range) * 10) / 10;
}

const days: Array<{ date: string; minT: number; maxT: number; rainHours: number[]; rainMm: number; code: number }> = [
  { date: '2026-05-01', minT: 7,  maxT: 14, rainHours: [18,19,20], rainMm: 1.2, code: 61 },
  { date: '2026-05-02', minT: 9,  maxT: 17, rainHours: [],           rainMm: 0,   code: 2  },
  { date: '2026-05-03', minT: 11, maxT: 21, rainHours: [],           rainMm: 0,   code: 1  },
  { date: '2026-05-04', minT: 8,  maxT: 13, rainHours: [6,7,8,9,10,11,12,13,14], rainMm: 3.8, code: 63 },
  { date: '2026-05-05', minT: 9,  maxT: 16, rainHours: [14,15],      rainMm: 0.6, code: 80 },
  { date: '2026-05-06', minT: 10, maxT: 19, rainHours: [],           rainMm: 0,   code: 1  },
];

for (const day of days) {
  const [year, month] = day.date.split('-');
  const monthDir = path.join(DATA_DIR, `${year}-${month}`);
  if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });

  const hourly: HourlyEntry[] = [];
  const precipPerHour = day.rainHours.length > 0 ? day.rainMm / day.rainHours.length : 0;

  for (let h = 0; h < 24; h++) {
    const time = `${day.date}T${String(h).padStart(2, '0')}:00`;
    const temperature = jitter(tempCurve(h, day.minT, day.maxT), 0.4);
    const isRainHour = day.rainHours.includes(h);
    const precipitation = isRainHour ? Math.round(jitter(precipPerHour, 0.2) * 10) / 10 : 0;
    const weathercode = isRainHour ? day.code : (h > 6 && h < 20 ? day.code : 0);
    hourly.push({ time, temperature, precipitation, weathercode });
  }

  const data: DayData = { date: day.date, location: 'Heubach', hourly };
  const filePath = path.join(monthDir, `${day.date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Erstellt: ${day.date} (${day.minT}–${day.maxT}°C)`);
}

console.log('\nTestdaten für 01.–06. Mai 2026 erfolgreich erstellt.');
