import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProgressDots } from './progress-dots';

describe('ProgressDots — pontos de cena como atalhos (redesign §6.4)', () => {
  it('rende um ponto clicável por cena', () => {
    render(<ProgressDots count={4} current={0} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('o conjunto de pontos é um grupo nomeado', () => {
    render(<ProgressDots count={4} current={0} />);
    expect(screen.getByRole('group', { name: 'cenas' })).toBeDefined();
  });

  it('clicar o k-ésimo ponto chama onSelect(k)', async () => {
    const onSelect = vi.fn();
    render(<ProgressDots count={4} current={0} onSelect={onSelect} />);
    await userEvent.click(screen.getAllByRole('button')[2]!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('o ponto atual é anunciado com aria-current="step"', () => {
    render(<ProgressDots count={4} current={1} />);
    const dots = screen.getAllByRole('button');
    expect(dots[1]?.getAttribute('aria-current')).toBe('step');
    expect(dots[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('não mostra nenhum número ao ouvinte', () => {
    const { container } = render(<ProgressDots count={4} current={1} />);
    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
  });
});
