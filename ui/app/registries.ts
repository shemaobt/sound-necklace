import type { ComponentType } from 'react';

/**
 * As três registries por `import.meta.glob` (docs/architecture.md §4), criadas UMA
 * vez pelo shell e nunca mais editadas — issues posteriores só ADICIONAM arquivos:
 *
 *  1. Estações   — /ui/pages/*\/index.tsx  (rota sem estação → fallback "em construção")
 *  2. Adapters   — /adapters/*\/register.ts (auto-registro de porta fixture/real)
 *  3. Addons     — /ui/app/addons/*.tsx     (chrome de nível-app na camada de overlay)
 *
 * Cada glob é um literal estático no top-level (exigência do Vite) e é embrulhado
 * numa fábrica cujo mapa de módulos é injetável (default = o glob), para os testes
 * passarem um mapa falso sem tocar disco.
 */

export type StationComponent = ComponentType;

interface DefaultExport<T> {
  default: T;
}

const stationModules = import.meta.glob('/ui/pages/*/index.tsx', {
  eager: true,
}) as Record<string, DefaultExport<StationComponent>>;

export function buildStationRegistry(
  modules: Record<string, DefaultExport<StationComponent>> = stationModules,
): Record<string, StationComponent> {
  const registry: Record<string, StationComponent> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const key = /\/ui\/pages\/([^/]+)\/index\.tsx$/.exec(path)?.[1];
    if (key && mod.default) registry[key] = mod.default;
  }
  return registry;
}

export interface AdapterRegistration {
  port: string;
  fixture: () => unknown;
  real: () => unknown;
}

const adapterModules = import.meta.glob('/adapters/*/register.ts', {
  eager: true,
}) as Record<string, DefaultExport<AdapterRegistration>>;

export function buildAdapterRegistry(
  modules: Record<string, DefaultExport<AdapterRegistration>> = adapterModules,
): Record<string, AdapterRegistration> {
  const registry: Record<string, AdapterRegistration> = {};
  for (const mod of Object.values(modules)) {
    if (mod.default?.port) registry[mod.default.port] = mod.default;
  }
  return registry;
}

export type AddonComponent = ComponentType;

const addonModules = import.meta.glob('/ui/app/addons/*.tsx', {
  eager: true,
}) as Record<string, DefaultExport<AddonComponent>>;

export function listAddons(
  modules: Record<string, DefaultExport<AddonComponent>> = addonModules,
): AddonComponent[] {
  return Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, mod]) => mod.default)
    .filter((c): c is AddonComponent => Boolean(c));
}
