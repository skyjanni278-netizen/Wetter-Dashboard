import { SetMetadata } from '@nestjs/common';

/** Metadaten-Schlüssel von `@Public()`; der `JwtAuthGuard` liest ihn an Handler und Controller. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Öffnet einen Endpunkt für Gäste (03 B4.7): Der globale `JwtAuthGuard` lässt die Anfrage ohne Token durch.
 * Am Controller wirkt der Dekorator für alle Handler, am Handler nur für diesen. Was ihn nicht hat, verlangt
 * ein gültiges Token (Schritt 10); ab Schritt 11 zusätzlich `@Roles(...)` (RolesGuard, sonst 403).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
