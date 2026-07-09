import { describe, expect, it } from 'vitest';

import { buildAdapterRegistry, buildStationRegistry, listAddons } from './registries';

function Fake() {
  return null;
}

describe('station-registry', () => {
  it('mapeia o diretório da estação para o componente e ignora chaves ausentes', () => {
    const registry = buildStationRegistry({
      '/ui/pages/setup/index.tsx': { default: Fake },
    });
    expect(registry.setup).toBe(Fake);
    expect(registry.triagem).toBeUndefined();
  });
});

describe('adapter-registry (descoberta real via glob)', () => {
  it('descobre os register.ts existentes e indexa por porta', () => {
    const registry = buildAdapterRegistry();
    expect(Object.keys(registry)).toContain('audio');
    expect(Object.keys(registry)).toContain('connectivity');
    expect(typeof registry.connectivity!.fixture).toBe('function');
  });
});

describe('addons-registry', () => {
  it('lista os addons default dos módulos', () => {
    const addons = listAddons({ './addons/exemplo.tsx': { default: Fake } });
    expect(addons).toEqual([Fake]);
  });

  it('em produção começa vazio (sem addons)', () => {
    expect(listAddons()).toEqual([]);
  });
});
