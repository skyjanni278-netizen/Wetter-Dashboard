// Ergänzung zur Vitest-Konfiguration des Angular-Builders (@angular/build:unit-test).
// Das Projekt liegt auf einer langsamen USB-Platte (FAT32). Starten zu viele
// jsdom-Worker gleichzeitig, läuft ihr Start in ein Timeout
// („Timeout waiting for worker to respond“). Deshalb höchstens 2 Worker.
export default {
  test: {
    maxWorkers: 2,
  },
};
