import { passwordFindings } from './password-scan';

/**
 * Jest `setupFilesAfterEnv` der e2e-Tests (03 B4.6, Schritt 10): Nach jeder Testdatei darf keine Antwort einer
 * e2e-App „password“ oder einen bcrypt-Hash enthalten haben (`password-scan.ts`).
 */
afterAll(() => {
  expect(passwordFindings()).toEqual([]);
});
