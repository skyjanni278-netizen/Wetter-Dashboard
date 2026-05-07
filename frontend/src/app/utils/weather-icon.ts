export function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 65) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

export function getWeatherDescription(code: number): string {
  if (code === 0) return 'Klarer Himmel';
  if (code === 1) return 'Überwiegend klar';
  if (code === 2) return 'Teilweise bewölkt';
  if (code === 3) return 'Bedeckt';
  if (code <= 48) return 'Nebel';
  if (code <= 55) return 'Nieselregen';
  if (code <= 65) return 'Regen';
  if (code <= 77) return 'Schneefall';
  if (code <= 82) return 'Regenschauer';
  if (code <= 86) return 'Schneeschauer';
  return 'Gewitter';
}

export function getWindDirection(degrees: number): string {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}
