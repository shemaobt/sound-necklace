import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProgressDots } from './progress-dots';

describe('ProgressDots — pontos de cena como atalhos (redesign §6.4)', () => {
  it('rende um ponto clicável por cena', () => {
    render(<ProgressDots count={4} current={0} dotLabel={(i) => `Cena ${i + 1}`} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('o conjunto de pontos é um grupo nomeado', () => {
    render(<ProgressDots count={4} current={0} dotLabel={(i) => `Cena ${i + 1}`} />);
    expect(screen.getByRole('group', { name: 'cenas' })).toBeDefined();
  });

  it('clicar o k-ésimo ponto chama onSelect(k)', async () => {
    const onSelect = vi.fn();
    render(
      <ProgressDots count={4} current={0} onSelect={onSelect} dotLabel={(i) => `Cena ${i + 1}`} />,
    );
    await userEvent.click(screen.getAllByRole('button')[2]!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('o ponto atual é anunciado com aria-current="step"', () => {
    render(<ProgressDots count={4} current={1} dotLabel={(i) => `Cena ${i + 1}`} />);
    const dots = screen.getAllByRole('button');
    expect(dots[1]?.getAttribute('aria-current')).toBe('step');
    expect(dots[0]?.getAttribute('aria-current')).toBeNull();
  });
});

/**
 * ENG-389 — o indicador diz QUAL cena, não só que existe uma.
 *
 * Na primeira validação o indicador era lido como "uma conta do colar": mesma
 * pérola, mesma linguagem visual, e o usuário não sabia em que cena estava nem
 * quais faltavam. Cor + número resolvem isso. É a única exceção ao §9.2
 * (decisão do dono, 2026-08-04) e está registrada em molecules/minimalism.test.tsx.
 */
describe('ProgressDots — qual cena é esta (ENG-389)', () => {
  const tint = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

  it('cada ponto mostra o número da sua cena, começando em 1', () => {
    render(<ProgressDots count={3} current={0} dotLabel={(i) => `Cena ${i + 1}`} />);

    expect(screen.getAllByRole('button').map((b) => b.textContent?.trim())).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('cada ponto é anunciado pela sua cena, não por um rótulo genérico', () => {
    render(<ProgressDots count={3} current={0} dotLabel={(i) => `Cena ${i + 1}`} />);

    expect(screen.getByRole('button', { name: 'Cena 2' })).toBeDefined();
  });

  it('o ponto pendente veste a cor da sua cena — é o que o liga ao colar', () => {
    render(
      <ProgressDots
        count={3}
        current={0}
        dotLabel={(i) => `Cena ${i + 1}`}
        scenes={[
          { state: 'tagged', tint },
          { state: 'pending', tint },
          { state: 'none_fit', tint },
        ]}
      />,
    );

    /* Antes da ENG-389 o pendente só ganhava a tinta quando era o ponto ATUAL; os
       demais ficavam num aro neutro, e a ligação com a cor da cena no colar se
       perdia justamente nas cenas que ainda faltavam classificar. */
    const pendente = screen.getByRole('button', { name: 'Cena 2' });
    expect(pendente.getAttribute('data-state')).toBe('pending');
    // o DOM normaliza o hex para rgb() ao ler de volta o style inline
    const TELHA_RGB = 'rgb(190, 74, 1)';
    expect(pendente.style.borderColor).toBe(TELHA_RGB);
    expect(pendente.style.color).toBe(TELHA_RGB);
  });

  it('o número não engole o estado: a cena classificada ainda traz o selo', () => {
    const { container } = render(
      <ProgressDots
        count={1}
        current={0}
        dotLabel={() => 'Cena 1'}
        scenes={[{ state: 'tagged', tint }]}
      />,
    );

    /* O selo tem de estar NO BADGE, fora do disco: `querySelector('svg')` sozinho
       passava também com o markup antigo, que empilhava o check dentro do botão —
       ou seja, não via justamente a colisão com o número que motivou a mudança. */
    expect(container.querySelector('.cds-progress-dots-badge svg')).not.toBeNull();
  });
});
