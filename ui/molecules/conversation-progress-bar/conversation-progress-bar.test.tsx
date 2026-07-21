import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { ConversationProgressBar, type ConversationTrecho } from './conversation-progress-bar';
import barCss from './conversation-progress-bar.css?raw';

const trecho = (count: number, base: string, label: string): ConversationTrecho => ({
  count,
  color: { base, lit: base, deep: base },
  label,
});

// história(11) + cena(5) + frase(5) = 21 perguntas
const TRECHOS = [
  trecho(11, '#a9a06a', 'A história'),
  trecho(5, '#be4a01', 'Chegada'),
  trecho(5, '#d98a54', 'Chegada'),
];

describe('ConversationProgressBar', () => {
  it('rende um segmento por trecho, largura proporcional à contagem', () => {
    const { container } = render(
      <ConversationProgressBar trechos={TRECHOS} current={0} total={21} ariaLabel="progresso" />,
    );
    const segs = container.querySelectorAll<HTMLElement>('.cds-conv-progress-seg');
    expect(segs).toHaveLength(3);
    expect(segs[0]!.style.width).toBe(`${(11 / 21) * 100}%`); // história = 11/21
  });

  it('a legenda é o rótulo do trecho ATUAL e nunca mostra um dígito', () => {
    const { container, rerender } = render(
      <ConversationProgressBar trechos={TRECHOS} current={3} total={21} ariaLabel="p" />,
    );
    expect(container.querySelector('.cds-conv-progress-caption')?.textContent).toBe('A história');
    expect(container.textContent ?? '').not.toMatch(/\d/);

    // avançar para dentro da primeira cena (índices 11..15) → a legenda vira o tipo dela
    rerender(<ConversationProgressBar trechos={TRECHOS} current={12} total={21} ariaLabel="p" />);
    expect(container.querySelector('.cds-conv-progress-caption')?.textContent).toBe('Chegada');
  });

  it('os segmentos até o trecho atual são "past"; os seguintes não', () => {
    const { container } = render(
      <ConversationProgressBar trechos={TRECHOS} current={12} total={21} ariaLabel="p" />,
    );
    const segs = container.querySelectorAll('.cds-conv-progress-seg');
    expect(segs[0]!.getAttribute('data-past')).toBe('true'); // história
    expect(segs[1]!.getAttribute('data-past')).toBe('true'); // cena atual
    expect(segs[2]!.getAttribute('data-past')).toBeNull(); // frase futura
  });

  it('tem um marcador e uma divisória entre cada par de trechos', () => {
    const { container } = render(
      <ConversationProgressBar trechos={TRECHOS} current={0} total={21} ariaLabel="p" />,
    );
    expect(container.querySelector('.cds-conv-progress-marker')).not.toBeNull();
    expect(container.querySelectorAll('.cds-conv-progress-tick')).toHaveLength(2); // 3 trechos → 2 fronteiras
  });

  it('sem trechos não rende nada', () => {
    const { container } = render(
      <ConversationProgressBar trechos={[]} current={0} total={0} ariaLabel="p" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('o deslize/fade só existe sob prefers-reduced-motion (§9.3)', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(barCss, guard);
    expect(outside).not.toMatch(/transition|animation|@keyframes/);
  });
});
