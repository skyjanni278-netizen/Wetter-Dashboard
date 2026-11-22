import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { loginUrlTree, safeReturnUrl } from './return-url';

describe('safeReturnUrl (kein Open Redirect)', () => {
  it.each(['/admin', '/admin/importe?seite=2', '/tag/2026-11-10', '/', '/admin#oben'])('%s: interner Pfad bleibt', url => {
    expect(safeReturnUrl(url)).toBe(url);
  });

  it.each([
    'https://evil.example/admin',
    '//evil.example/admin',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'admin',
    '',
    ' /admin',
    '/admin\nSet-Cookie',
    '/admin x',
    '/admin/anmeldung',
    '/admin/anmeldung?returnUrl=/admin',
  ])('%j wird verworfen', url => {
    expect(safeReturnUrl(url)).toBeNull();
  });

  it('kein Text, zu lang → null', () => {
    expect(safeReturnUrl(undefined)).toBeNull();
    expect(safeReturnUrl(42)).toBeNull();
    expect(safeReturnUrl(['/admin'])).toBeNull();
    expect(safeReturnUrl(`/${'a'.repeat(2000)}`)).toBeNull();
  });
});

describe('loginUrlTree', () => {
  function router(): Router {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    return TestBed.inject(Router);
  }

  it('mit internem Ziel: /admin/anmeldung?returnUrl=…', () => {
    const r = router();
    expect(r.serializeUrl(loginUrlTree(r, '/admin/importe?seite=2'))).toBe('/admin/anmeldung?returnUrl=%2Fadmin%2Fimporte%3Fseite%3D2');
  });

  it('fremdes oder fehlendes Ziel entfällt', () => {
    const r = router();
    expect(r.serializeUrl(loginUrlTree(r, '//evil.example'))).toBe('/admin/anmeldung');
    expect(r.serializeUrl(loginUrlTree(r))).toBe('/admin/anmeldung');
  });
});
