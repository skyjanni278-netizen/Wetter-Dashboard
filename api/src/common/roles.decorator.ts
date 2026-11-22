import { SetMetadata } from '@nestjs/common';

/** Metadaten-Schlüssel von `@Roles(...)`. */
export const ROLES_KEY = 'roles';

/**
 * Verlangt eine der Rollen (03 B4.7), z. B. `@Roles('admin')`. Schritt 10 legt nur Dekorator und Metadaten an;
 * geprüft werden sie ab Schritt 11 vom `RolesGuard`. Bis dahin schützt der `JwtAuthGuard` (gültiges Token).
 */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
