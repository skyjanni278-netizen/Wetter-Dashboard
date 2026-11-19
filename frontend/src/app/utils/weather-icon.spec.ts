import { getWeatherIcon, getWeatherDescription, getWindDirection } from './weather-icon';

describe('weather-icon (Ist-Verhalten)', () => {
  const cases: [number, string, string][] = [
    [0, '☀️', 'Klarer Himmel'],
    [1, '🌤️', 'Überwiegend klar'],
    [2, '⛅', 'Teilweise bewölkt'],
    [3, '☁️', 'Bedeckt'],
    [45, '🌫️', 'Nebel'],
    [48, '🌫️', 'Nebel'],
    [51, '🌦️', 'Nieselregen'],
    [55, '🌦️', 'Nieselregen'],
    // IST-Verhalten, wird in Schritt 7 geändert (F26): gefrierender Nieselregen wird als Regen angezeigt
    [56, '🌧️', 'Regen'],
    [57, '🌧️', 'Regen'],
    [61, '🌧️', 'Regen'],
    [65, '🌧️', 'Regen'],
    // IST-Verhalten, wird in Schritt 7 geändert (F26): gefrierender Regen wird als Schneefall angezeigt
    [66, '🌨️', 'Schneefall'],
    [67, '🌨️', 'Schneefall'],
    [71, '🌨️', 'Schneefall'],
    [77, '🌨️', 'Schneefall'],
    [80, '🌦️', 'Regenschauer'],
    [82, '🌦️', 'Regenschauer'],
    [85, '🌨️', 'Schneeschauer'],
    [86, '🌨️', 'Schneeschauer'],
    [95, '⛈️', 'Gewitter'],
    [99, '⛈️', 'Gewitter'],
  ];

  for (const [code, icon, desc] of cases) {
    it(`Code ${code} -> ${icon} / ${desc}`, () => {
      expect(getWeatherIcon(code)).toBe(icon);
      expect(getWeatherDescription(code)).toBe(desc);
    });
  }

  it('null -> Nebel', () => {
    // IST-Verhalten, wird in Schritt 7 geändert (F26)
    expect(getWeatherIcon(null as unknown as number)).toBe('🌫️');
    expect(getWeatherDescription(null as unknown as number)).toBe('Nebel');
  });

  describe('getWindDirection', () => {
    const dirs: [number, string][] = [
      [0, 'N'], [22, 'N'], [23, 'NO'], [90, 'O'], [180, 'S'], [270, 'W'], [337, 'NW'], [359, 'N'],
    ];
    for (const [deg, dir] of dirs) {
      it(`${deg} Grad -> ${dir}`, () => expect(getWindDirection(deg)).toBe(dir));
    }
    it('null -> N', () => {
      // IST-Verhalten, wird in Schritt 7 geändert (F26)
      expect(getWindDirection(null as unknown as number)).toBe('N');
    });
  });
});
