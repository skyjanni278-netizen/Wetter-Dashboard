import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../src/common/public.decorator';
import { ROLES_KEY } from '../../src/common/roles.decorator';

export interface RouteAccess {
  /** z. B. `GET /api/imports/:id` (Express-Schreibweise wie im Router). */
  route: string;
  handler: string;
  isPublic: boolean;
  roles: string[];
}

function paths(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [value === undefined ? '/' : String(value)];
}

function join(...parts: string[]): string {
  const joined = `/${parts.join('/')}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

/**
 * Alle Handler mit Routen-Metadaten, gefunden über den `DiscoveryService` von Nest (nicht über eine Handliste):
 * je Controller jede Methode mit `@Get`/`@Post`/…, dazu die wirksamen Dekoratoren wie in den Guards
 * (`getAllAndOverride` über Handler und Controller). Die App braucht `DiscoveryModule` in den Imports.
 */
export function routeAccess(app: INestApplication, prefix = 'api'): RouteAccess[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const result: RouteAccess[] = [];
  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype as (new (...args: unknown[]) => object) | undefined;
    if (!controller) continue;
    const prototype = controller.prototype as Record<string, unknown>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name] as (...args: unknown[]) => unknown;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined || Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
      const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [handler, controller]) === true;
      const roles = reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [handler, controller]) ?? [];
      for (const base of paths(Reflect.getMetadata(PATH_METADATA, controller))) {
        for (const sub of paths(Reflect.getMetadata(PATH_METADATA, handler))) {
          result.push({ route: `${RequestMethod[method]} ${join(prefix, base, sub)}`, handler: `${controller.name}.${name}`, isPublic, roles });
        }
      }
    }
  }
  return result.sort((a, b) => a.route.localeCompare(b.route));
}

/** Verstöße gegen 03 B4.7: Route mit keinem oder beiden Dekoratoren (`@Public()` bzw. `@Roles(...)` mit Rolle). */
export function accessViolations(routes: readonly RouteAccess[]): string[] {
  return routes
    .filter(r => r.isPublic === (r.roles.length > 0))
    .map(r => `${r.route} (${r.handler}): ${r.isPublic ? '@Public() und @Roles()' : 'weder @Public() noch @Roles()'}`);
}
