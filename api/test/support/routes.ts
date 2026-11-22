import type { INestApplication } from '@nestjs/common';

export interface RegisteredRoute {
  method: string;
  /** Express-Schreibweise, z. B. `/api/days/:date`. */
  path: string;
}

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Alle Routen, die Nest im Express-Router registriert hat (ohne Middleware), sortiert. */
export function registeredRoutes(app: INestApplication): RegisteredRoute[] {
  const express = app.getHttpAdapter().getInstance() as { router?: { stack: Layer[] }; _router?: { stack: Layer[] } };
  const stack = (express.router ?? express._router)?.stack ?? [];
  return stack
    .filter((layer): layer is Required<Layer> => !!layer.route)
    .flatMap(layer =>
      Object.keys(layer.route.methods)
        .filter(method => layer.route.methods[method])
        .map(method => ({ method: method.toUpperCase(), path: layer.route.path })),
    )
    .sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}
