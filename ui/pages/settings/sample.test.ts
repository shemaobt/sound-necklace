import { describe, expect, it, vi } from 'vitest';

import type { BucketAudio } from '../../../contracts';
import {
  resolveSample,
  SAMPLE_BEAD_CAP,
  SAMPLE_SEC,
  sampleAudio,
  sampleBeadCount,
  sampleBeadSize,
} from './sample';

function audio(over: Partial<BucketAudio> = {}): BucketAudio {
  return { id: 'a1', filename: 'um.wav', consent_present: true, ...over };
}

describe('sampleAudio — o primeiro da listagem', () => {
  it('pega o primeiro, que é o mesmo que a Setup mostra no topo', () => {
    const first = audio({ id: 'a1' });
    expect(sampleAudio([first, audio({ id: 'a2' })])).toBe(first);
  });

  it('sem listagem (ou vazia) não há amostra', () => {
    expect(sampleAudio(null)).toBeNull();
    expect(sampleAudio([])).toBeNull();
  });
});

/**
 * É a contagem que carrega o significado do nível: "Pequena" quer dizer MAIS contas
 * no mesmo trecho. Se a conta encolhe e o número não sobe, a amostra não ensina nada.
 */
describe('sampleBeadCount — a densidade que o nível produz no mesmo trecho', () => {
  it('conta menor no mesmo trecho dá mais contas', () => {
    const pequena = sampleBeadCount(0.2);
    const media = sampleBeadCount(0.3);
    const grande = sampleBeadCount(0.5);
    expect(pequena).toBeGreaterThan(media);
    expect(media).toBeGreaterThan(grande);
    expect(grande).toBe(Math.floor(SAMPLE_SEC / 0.5));
  });

  it('conta maior que a amostra inteira ainda é UMA conta, nunca zero', () => {
    expect(sampleBeadCount(SAMPLE_SEC * 3)).toBe(1);
  });

  it('acousteme fininho não vira uma régua ilegível — há teto', () => {
    expect(sampleBeadCount(0.001)).toBe(SAMPLE_BEAD_CAP);
  });

  it('beadSec inválido não desenha cordão nenhum', () => {
    expect(sampleBeadCount(0)).toBe(0);
    expect(sampleBeadCount(-1)).toBe(0);
    expect(sampleBeadCount(NaN)).toBe(0);
  });
});

describe('sampleBeadSize — mais contas, conta menor, para o cordão caber', () => {
  it('encolhe de forma monótona conforme a contagem sobe', () => {
    const sizes = [6, 20, 30, 50].map(sampleBeadSize);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
  });
});

describe('resolveSample — o beadSec sai do acousteme DAQUELE áudio', () => {
  it('passa o acousteme do áudio escolhido ao resolvedor', () => {
    const resolve = vi.fn(() => ({ beadSec: 0.25 }));
    const a = audio();
    expect(resolveSample(resolve, 'small', a)).toBe(0.25);
    expect(resolve).toHaveBeenCalledWith('small', null);
  });

  it('sem áudio não há o que resolver', () => {
    expect(resolveSample(() => ({ beadSec: 0.25 }), 'small', null)).toBeNull();
  });

  it('um beadSec degenerado não vira grade', () => {
    expect(resolveSample(() => ({ beadSec: 0 }), 'small', audio())).toBeNull();
  });
});
