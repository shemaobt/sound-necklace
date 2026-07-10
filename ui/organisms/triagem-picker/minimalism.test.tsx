import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TriagemPicker } from './triagem-picker';

/**
 * Guarda de minimalismo para cultura oral (PRD v2 §9.2): o picker é operado
 * junto ao ouvinte — nenhum dígito em texto visível, nome acessível ou title
 * (por isso a copy adotada é "Ver todos os tipos por tema", não "os 27 tipos").
 */
function assertDigitFree(container: HTMLElement) {
  expect(container.textContent ?? '').not.toMatch(/\d/);
  for (const el of container.querySelectorAll('[aria-label]')) {
    expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
  }
  for (const el of container.querySelectorAll('[title]')) {
    expect(el.getAttribute('title')).not.toMatch(/\d/);
  }
  for (const el of container.querySelectorAll('[placeholder]')) {
    expect(el.getAttribute('placeholder')).not.toMatch(/\d/);
  }
}

describe('o picker não mostra dígitos ao ouvinte (PRD v2 §9.2)', () => {
  it('recolhido, expandido e no passo de confiança, não rende dígito algum', () => {
    const { container } = render(<TriagemPicker />);
    assertDigitFree(container);

    const disclosure = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Ver todos os tipos por tema',
    )!;
    fireEvent.click(disclosure);
    assertDigitFree(container);

    fireEvent.click(container.querySelector('[role="radio"][title="MEAL_SCENE"]')!);
    assertDigitFree(container);
  });
});
