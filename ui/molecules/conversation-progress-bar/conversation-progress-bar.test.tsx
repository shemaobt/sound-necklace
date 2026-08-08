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

  /**
   * O quanto já andou, DESENHADO — a porcentagem que o §9.2 proíbe imprimir em
   * tela de ouvinte. Antes o trecho inteiro acendia de uma vez ao ser alcançado:
   * dentro de uma cena de cinco perguntas a barra ficava idêntica da primeira à
   * última, e a única coisa que se movia era o marcador.
   */
  const fills = (el: HTMLElement): string[] =>
    [...el.querySelectorAll<HTMLElement>('.cds-conv-progress-fill')].map((f) => f.style.width);

  it('o preenchimento cobre a pergunta em foco e para ali', () => {
    const { container } = render(
      <ConversationProgressBar trechos={TRECHOS} current={0} total={21} ariaLabel="p" />,
    );
    // 1ª das 11 perguntas da história: um onze avos do primeiro segmento, zero no resto
    expect(fills(container)).toEqual([`${(1 / 11) * 100}%`, '0%', '0%']);
  });

  it('o preenchimento avança DENTRO do trecho, pergunta a pergunta', () => {
    const { container, rerender } = render(
      <ConversationProgressBar trechos={TRECHOS} current={11} total={21} ariaLabel="p" />,
    );
    // 1ª pergunta da cena (índice 11): história cheia, um quinto da cena
    expect(fills(container)).toEqual(['100%', `${(1 / 5) * 100}%`, '0%']);

    rerender(<ConversationProgressBar trechos={TRECHOS} current={13} total={21} ariaLabel="p" />);
    expect(fills(container)).toEqual(['100%', `${(3 / 5) * 100}%`, '0%']);
  });

  it('na última pergunta a barra está cheia', () => {
    const { container } = render(
      <ConversationProgressBar trechos={TRECHOS} current={20} total={21} ariaLabel="p" />,
    );
    expect(fills(container)).toEqual(['100%', '100%', '100%']);
    expect(container.querySelector<HTMLElement>('.cds-conv-progress-marker')!.style.left).toBe(
      '100%',
    );
  });

  it('o marcador é a cabeça do preenchimento — a mesma posição, não duas verdades', () => {
    const { container } = render(
      <ConversationProgressBar trechos={TRECHOS} current={13} total={21} ariaLabel="p" />,
    );
    expect(container.querySelector<HTMLElement>('.cds-conv-progress-marker')!.style.left).toBe(
      `${(14 / 21) * 100}%`,
    );
  });

  it('anuncia progresso a quem ouve a tela, e ainda assim sem número falado', () => {
    const { getByRole } = render(
      <ConversationProgressBar trechos={TRECHOS} current={13} total={21} ariaLabel="progresso" />,
    );
    const bar = getByRole('progressbar', { name: 'progresso' });
    expect(bar.getAttribute('aria-valuenow')).toBe('14');
    expect(bar.getAttribute('aria-valuemax')).toBe('21');
    // aria-valuetext substitui a leitura do número: o leitor de tela diz o trecho
    expect(bar.getAttribute('aria-valuetext')).toBe('Chegada');
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
