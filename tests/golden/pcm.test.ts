import { describe, expect, it } from 'vitest';

import { lcgSequence, makePcm } from './pcm';

/**
 * Vetores conhecidos do LCG (x = (1103515245*x + 12345) mod 2^31, em BigInt),
 * verificados com aritmética inteira exata fora do harness (ver README §PCM):
 * seed 42 → x1 = 1250496027, x2 = 1116302264
 */
describe('gerador de PCM sintético (LCG determinístico)', () => {
  it('produz a sequência inteira exata dos vetores conhecidos', () => {
    const xs = lcgSequence(42n, 2);
    expect(xs).toEqual([1250496027n, 1116302264n]);
  });

  it('converte para amostras float em [-1, 1) via x/2^30 - 1', () => {
    const pcm = makePcm(42, 2);
    expect(pcm).toBeInstanceOf(Float32Array);
    expect(pcm[0]).toBeCloseTo(1250496027 / 2 ** 30 - 1, 6);
    expect(pcm[1]).toBeCloseTo(1116302264 / 2 ** 30 - 1, 6);
  });

  it('é determinístico e sensível à seed', () => {
    const a = makePcm(7, 1000);
    const b = makePcm(7, 1000);
    const c = makePcm(8, 1000);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });
});
