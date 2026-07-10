import { describe, expect, it } from 'vitest';

import TutorialAddon from './addons/tutorial';
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

describe('adapter-registry', () => {
  it('descobre os register.ts existentes via glob real', () => {
    expect(Object.keys(buildAdapterRegistry())).toEqual(
      expect.arrayContaining(['audio', 'connectivity']),
    );
  });

  it('indexa cada registro pela sua porta', () => {
    const foo = { port: 'foo', fixture: () => 'F', real: () => 'R' };
    const registry = buildAdapterRegistry({ '/adapters/foo/register.ts': { default: foo } });
    expect(registry.foo).toBe(foo);
  });
});

describe('addons-registry', () => {
  it('lista os addons default dos módulos', () => {
    const addons = listAddons({ './addons/exemplo.tsx': { default: Fake } });
    expect(addons).toEqual([Fake]);
  });

  it('descobre os addons existentes via glob real', () => {
    expect(listAddons()).toContain(TutorialAddon);
  });
});
