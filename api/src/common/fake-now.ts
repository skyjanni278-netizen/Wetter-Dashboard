import { Logger } from '@nestjs/common';
import { Clock, FixedClock, SystemClock } from './clock';

/**
 * 03 B4.8: `FAKE_NOW` setzt die Uhr für Prüfungen im Browser fest. Form (`z.iso.datetime()`, UTC mit `Z`) und
 * die Regel „nicht in Produktion, nur mit `SCHEDULER_ENABLED=false`“ prüft `EnvSchema` beim Start; hier kommt
 * nur noch der geprüfte Wert an. Nicht gesetzt → `SystemClock`.
 */
export function clockFor(fakeNow: string | undefined): Clock {
  if (!fakeNow) return new SystemClock();
  new Logger('Clock').warn(`Uhr steht fest auf FAKE_NOW=${fakeNow} (FixedClock, nur für Prüfungen; Scheduler aus)`);
  return new FixedClock(fakeNow);
}
