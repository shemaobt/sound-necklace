/**
 * StubGranularityResolver — o resolver de granularidade como STUB (§6.1/§15.2 O8).
 * A REGRA real (acousteme → beadSec) é ENG-242 (blocked-O8); aqui o stub lê números
 * fixture-authored do envelope quando presentes, senão cai em constantes fallback
 * PROVISÓRIAS. NENHUMA matemática de derivação.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AcoustemeEnvelope } from '../../contracts';
import { StubGranularityResolver } from './stub';

const envelope = (beadSec: Record<string, number>): AcoustemeEnvelope => ({
  version: 1,
  data: { bead_sec: beadSec },
});

describe('StubGranularityResolver.resolve', () => {
  it('lê o beadSec fixture-authored do envelope por nível', () => {
    const resolver = new StubGranularityResolver();
    const env = envelope({ pequena: 0.15, media: 0.25, grande: 0.5 });

    expect(resolver.resolve('pequena', env).beadSec).toBe(0.15);
    expect(resolver.resolve('media', env).beadSec).toBe(0.25);
    expect(resolver.resolve('grande', env).beadSec).toBe(0.5);
  });

  it('cai no fallback PROVISÓRIO quando não há envelope (media ≈ 0.25 s)', () => {
    const resolver = new StubGranularityResolver();

    expect(resolver.resolve('media', null).beadSec).toBe(0.25);
    expect(resolver.resolve('pequena', null).beadSec).toBeGreaterThan(0);
    expect(resolver.resolve('grande', null).beadSec).toBeGreaterThan(0);
  });

  it('cai no fallback quando o envelope existe mas não traz bead_sec (data opaco)', () => {
    const resolver = new StubGranularityResolver();
    const opaque: AcoustemeEnvelope = { version: 1, data: { algo: 'sem bead_sec' } };

    expect(resolver.resolve('media', opaque).beadSec).toBe(0.25);
  });

  it('garante beadSec > 0 em todos os níveis, com e sem envelope', () => {
    const resolver = new StubGranularityResolver();
    const env = envelope({ pequena: 0.2, media: 0.3, grande: 0.6 });

    for (const level of ['pequena', 'media', 'grande'] as const) {
      expect(resolver.resolve(level, env).beadSec).toBeGreaterThan(0);
      expect(resolver.resolve(level, null).beadSec).toBeGreaterThan(0);
    }
  });
});

describe('marcação do stub', () => {
  it('o módulo carrega um marcador PROVISIONAL grep-able (nenhuma regra O8 inventada)', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'stub.ts'), 'utf8');

    expect(source).toContain('PROVISIONAL');
  });
});
