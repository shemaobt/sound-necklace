import { describe, expect, it } from 'vitest';

import { phrasePalette } from '../../tokens';
import { phraseColor, phraseLabel } from './wiring';

/**
 * Núcleo puro da estação de frases: os rótulos saem por extenso (§9.2, a tela do
 * ouvinte não mostra dígitos) e as cores ciclam a paleta de frases (§4.2).
 */
describe('segmentação — rótulos e cores das frases', () => {
  it('nomeia as frases por extenso, sem dígito', () => {
    expect(phraseLabel(0)).toBe('Frase um');
    expect(phraseLabel(1)).toBe('Frase dois');
    expect(phraseLabel(0)).not.toMatch(/\d/);
  });

  it('além do intervalo por extenso cai em "Frase" (a cor ainda distingue)', () => {
    expect(phraseLabel(999)).toBe('Frase');
  });

  it('as cores das frases ciclam a paleta de frases', () => {
    expect(phraseColor(0)).toBe(phrasePalette[0]);
    expect(phraseColor(phrasePalette.length)).toBe(phrasePalette[0]);
  });
});
