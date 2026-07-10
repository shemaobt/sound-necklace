import { describe, expect, it } from 'vitest';

import { answerResourcePath } from './path';

describe('answerResourcePath', () => {
  it('nível 1 → respostas/level1/<k>.webm', () => {
    expect(answerResourcePath({ level: 1, k: 'recontar' })).toBe('respostas/level1/recontar.webm');
  });

  it('nível 2 interpola o part_id (PT#) → respostas/level2/<part_id>/<k>.webm', () => {
    expect(answerResourcePath({ level: 2, partId: 'PT3', k: 'quem' })).toBe(
      'respostas/level2/PT3/quem.webm',
    );
  });

  it('nível 3 interpola o prop_id (P#) → respostas/level3/<prop_id>/<k>.webm', () => {
    expect(answerResourcePath({ level: 3, propId: 'P12', k: 'oque' })).toBe(
      'respostas/level3/P12/oque.webm',
    );
  });

  it('recusa um k que viola o schema canônico de caminho (§10.4)', () => {
    expect(() => answerResourcePath({ level: 1, k: 'MAIÚSCULA' })).toThrow();
  });
});
