/** WMO-Wettercodes, wie Open-Meteo sie liefert (V19, F26). */
const WEATHER_CODES: Record<number, { icon: string; description: string }> = {
  0: { icon: '☀️', description: 'Klarer Himmel' },
  1: { icon: '🌤️', description: 'Überwiegend klar' },
  2: { icon: '⛅', description: 'Teilweise bewölkt' },
  3: { icon: '☁️', description: 'Bedeckt' },
  45: { icon: '🌫️', description: 'Nebel' },
  48: { icon: '🌫️', description: 'Reifnebel' },
  51: { icon: '🌦️', description: 'Nieselregen' },
  53: { icon: '🌦️', description: 'Nieselregen' },
  55: { icon: '🌦️', description: 'Nieselregen' },
  56: { icon: '🌧️', description: 'Gefrierender Niesel' },
  57: { icon: '🌧️', description: 'Gefrierender Niesel' },
  61: { icon: '🌧️', description: 'Regen' },
  63: { icon: '🌧️', description: 'Regen' },
  65: { icon: '🌧️', description: 'Regen' },
  66: { icon: '🌧️', description: 'Gefrierender Regen' },
  67: { icon: '🌧️', description: 'Gefrierender Regen' },
  71: { icon: '🌨️', description: 'Schneefall' },
  73: { icon: '🌨️', description: 'Schneefall' },
  75: { icon: '🌨️', description: 'Schneefall' },
  77: { icon: '🌨️', description: 'Schneefall' },
  80: { icon: '🌦️', description: 'Regenschauer' },
  81: { icon: '🌦️', description: 'Regenschauer' },
  82: { icon: '🌦️', description: 'Regenschauer' },
  85: { icon: '🌨️', description: 'Schneeschauer' },
  86: { icon: '🌨️', description: 'Schneeschauer' },
  95: { icon: '⛈️', description: 'Gewitter' },
  96: { icon: '⛈️', description: 'Gewitter mit Hagel' },
  99: { icon: '⛈️', description: 'Gewitter mit Hagel' },
};

const UNKNOWN_ICON = '❓';

/** Die 28 gültigen WMO-Codes aufsteigend (R15), z. B. für die Auswahl im Korrekturformular. */
export const WEATHER_CODE_VALUES: readonly number[] = Object.keys(WEATHER_CODES).map(Number).sort((a, b) => a - b);

export function getWeatherIcon(code: number | null): string {
  if (code === null || code === undefined) return UNKNOWN_ICON;
  return WEATHER_CODES[code]?.icon ?? UNKNOWN_ICON;
}

export function describeWeather(code: number | null): string {
  if (code === null || code === undefined) return 'Keine Angabe';
  return WEATHER_CODES[code]?.description ?? 'Unbekannt';
}

/** Bisheriger Name, bleibt für bestehende Aufrufer erhalten. */
export const getWeatherDescription = describeWeather;

export function getWindDirection(degrees: number): string {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}
