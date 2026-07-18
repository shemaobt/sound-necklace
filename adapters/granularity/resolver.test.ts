/**
 * AcoustemeGranularityResolver — a regra O8 (§6.1/§15.2), resolvida pela tripod-api
 * (PR #100 "acousteme artifact + consumption API"): beadSec = granularity_frames[nível]
 * × hop_sec. A grade do tokenizador (hop 20 ms, presets 10/25/50 frames) é uniforme;
 * áudios sem acousteme caem nela. Testa a REGRA (entradas → beadSec), sem inspecionar
 * o interior.
 */

import { describe, expect, it } from 'vitest';

import type { AcoustemeEnvelope } from '../../contracts';
import { AcoustemeGranularityResolver } from './resolver';

/** Envelope com a grade do tokenizador (a mesma que o backend embute por áudio). */
const grid = (
  granularity_frames: { small: number; medium: number; large: number } = {
    small: 10,
    medium: 25,
    large: 50,
  },
  hop_sec = 0.02,
): AcoustemeEnvelope => ({
  codebook_version: 'terena-xlsr53-k100-v1',
  hop_sec,
  granularity_frames,
});

describe('AcoustemeGranularityResolver.resolve — regra O8 (frames × hop)', () => {
  it('deriva do envelope: 10/25/50 frames × 20 ms = 0.20 / 0.50 / 1.00 s', () => {
    const r = new AcoustemeGranularityResolver();
    const env = grid();

    expect(r.resolve('small', env).beadSec).toBe(0.2);
    expect(r.resolve('medium', env).beadSec).toBe(0.5);
    expect(r.resolve('large', env).beadSec).toBe(1);
  });

  it('mapeia cada nível à sua chave da grade (small/medium/large), lendo o envelope', () => {
    const r = new AcoustemeGranularityResolver();
    // grade não-uniforme: prova que lê a chave certa por nível, não uma constante
    const env = grid({ small: 25, medium: 50, large: 10 });

    expect(r.resolve('small', env).beadSec).toBe(0.5); // 25 × 0.02
    expect(r.resolve('medium', env).beadSec).toBe(1); // 50 × 0.02
    expect(r.resolve('large', env).beadSec).toBe(0.2); // 10 × 0.02
  });

  it('usa o hop_sec do próprio envelope', () => {
    const r = new AcoustemeGranularityResolver();
    const env = grid({ small: 10, medium: 25, large: 50 }, 0.04);

    expect(r.resolve('medium', env).beadSec).toBeCloseTo(1, 10); // 25 × 0.04
  });

  it('sem acousteme, cai na grade uniforme fixa do tokenizador (0.20 / 0.50 / 1.00 s)', () => {
    const r = new AcoustemeGranularityResolver();

    expect(r.resolve('small', null).beadSec).toBe(0.2);
    expect(r.resolve('medium', null).beadSec).toBe(0.5);
    expect(r.resolve('large', null).beadSec).toBe(1);
  });

  it('garante beadSec > 0 em todos os níveis, com e sem envelope', () => {
    const r = new AcoustemeGranularityResolver();
    const env = grid();

    for (const level of ['small', 'medium', 'large'] as const) {
      expect(r.resolve(level, env).beadSec).toBeGreaterThan(0);
      expect(r.resolve(level, null).beadSec).toBeGreaterThan(0);
    }
  });
});
