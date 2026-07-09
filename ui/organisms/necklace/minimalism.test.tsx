import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Necklace } from './necklace';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

/**
 * Guarda de minimalismo para cultura oral (PRD v2 §9.2): o colar é a tela do
 * ouvinte — nenhum dígito vaza como texto visível, nome acessível ou title. Os
 * índices de conta vivem só em `data-idx` (interno, não apresentado).
 */
describe('o colar não mostra dígitos ao ouvinte (PRD v2 §9.2)', () => {
  it('com props normais, não rende dígito algum em texto/aria/title', () => {
    const { container } = render(
      <Necklace
        totalBeads={40}
        beadSec={0.25}
        segments={[{ span: { s: 0, e: 5 }, tint: telha }]}
        lockedEndBeads={[5]}
        selection={{ s: 8, e: 12 }}
        window={{ s: 3, e: 9 }}
        playbackHead={7}
      />,
    );
    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
    for (const el of container.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/\d/);
    }
  });
});
