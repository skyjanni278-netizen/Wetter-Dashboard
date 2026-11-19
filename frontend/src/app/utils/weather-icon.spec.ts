import { getWeatherIcon, describeWeather, getWindDirection } from './weather-icon';

describe('weather-icon (WMO-Tabelle, V19)', () => {
  const cases: [number, string, string][] = [
    [0, '☀️', 'Klarer Himmel'],
    [1, '🌤️', 'Überwiegend klar'],
    [2, '⛅', 'Teilweise bewölkt'],
    [3, '☁️', 'Bedeckt'],
    [45, '🌫️', 'Nebel'],
    [48, '🌫️', 'Reifnebel'],
    [51, '🌦️', 'Nieselregen'],
    [55, '🌦️', 'Nieselregen'],
    [56, '🌧️', 'Gefrierender Niesel'],
    [57, '🌧️', 'Gefrierender Niesel'],
    [61, '🌧️', 'Regen'],
    [65, '🌧️', 'Regen'],
    [66, '🌧️', 'Gefrierender Regen'],
    [67, '🌧️', 'Gefrierender Regen'],
    [71, '🌨️', 'Schneefall'],
    [77, '🌨️', 'Schneefall'],
    [80, '🌦️', 'Regenschauer'],
    [82, '🌦️', 'Regenschauer'],
    [85, '🌨️', 'Schneeschauer'],
    [86, '🌨️', 'Schneeschauer'],
    [95, '⛈️', 'Gewitter'],
    [96, '⛈️', 'Gewitter mit Hagel'],
    [99, '⛈️', 'Gewitter mit Hagel'],
  ];

  for (const [code, icon, desc] of cases) {
    it(`Code ${code} -> ${icon} / ${desc}`, () => {
      expect(getWeatherIcon(code)).toBe(icon);
      expect(describeWeather(code)).toBe(desc);
    });
  }

  it('describeWeather: 66 / 57 / 100 / null', () => {
    expect(describeWeather(66)).toBe('Gefrierender Regen');
    expect(describeWeather(57)).toBe('Gefrierender Niesel');
    expect(describeWeather(100)).toBe('Unbekannt');
    expect(describeWeather(null)).toBe('Keine Angabe');
  });

  it('unbekannter Code und null haben ein neutrales Symbol', () => {
    expect(getWeatherIcon(100)).toBe('❓');
    expect(getWeatherIcon(null)).toBe('❓');
  });

  describe('getWindDirection', () => {
    const dirs: [number, string][] = [
      [0, 'N'], [22, 'N'], [23, 'NO'], [90, 'O'], [180, 'S'], [270, 'W'], [337, 'NW'], [359, 'N'],
    ];
    for (const [deg, dir] of dirs) {
      it(`${deg} Grad -> ${dir}`, () => expect(getWindDirection(deg)).toBe(dir));
    }
    it('null -> N', () => {
      // Ist-Verhalten, unverändert
      expect(getWindDirection(null as unknown as number)).toBe('N');
    });
  });
});
