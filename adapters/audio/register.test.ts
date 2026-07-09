/**
 * register.ts — auto-registro aditivo (docs/architecture.md §4): o composition
 * root (ENG-224) colhe via import.meta.glob('/adapters/*\/register.ts');
 * cada adapter exporta { port, fixture, real } com a fixture como default.
 */

import { describe, expect, it } from 'vitest';

import { pcmSpecBytes } from './fixture';
import registration from './register';

describe('registro do adapter de áudio', () => {
  it('declara a porta "audio" com factories fixture e real', () => {
    expect(registration.port).toBe('audio');
    expect(typeof registration.fixture).toBe('function');
    // a factory real constrói sem AudioContext (contexto lazy) — inclusive em CI
    expect(() => registration.real()).not.toThrow();
  });

  it('a factory fixture devolve um engine que decodifica sem AudioContext', async () => {
    const engine = registration.fixture();
    const decoded = await engine.decode(
      pcmSpecBytes({ seed: 7, sampleRate: 8000, samples: 8000, channels: 1 }),
    );
    expect(decoded.duration).toBe(1);
  });
});
