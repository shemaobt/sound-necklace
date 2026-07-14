import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { KindCard } from './kind-card';

const teal = { base: '#4E7A6A', lit: '#4E7A6A', deep: '#365548' };

describe('KindCard — cartão de tipo de cena + variante "nenhum se encaixa" (redesign §6.4)', () => {
  it('é um rádio nomeado pelo rótulo PT-BR, com o valor inglês no title', () => {
    render(<KindCard label="Chegada a um lugar" en="ARRIVAL_SCENE" tint={teal} />);
    const radio = screen.getByRole('radio', { name: 'Chegada a um lugar' });
    expect(radio.getAttribute('title')).toBe('ARRIVAL_SCENE');
  });

  it('reflete a seleção via aria-checked', () => {
    const { rerender } = render(<KindCard label="Chegada a um lugar" tint={teal} />);
    expect(
      screen.getByRole('radio', { name: 'Chegada a um lugar' }).getAttribute('aria-checked'),
    ).toBe('false');
    rerender(<KindCard label="Chegada a um lugar" tint={teal} selected />);
    expect(screen.getByRole('radio', { name: 'Chegada a um lugar', checked: true })).toBeDefined();
  });

  it('clicar chama onSelect', async () => {
    const onSelect = vi.fn();
    render(<KindCard label="Chegada a um lugar" tint={teal} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Chegada a um lugar' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('mostra um ponto de cor chapado tingido pelo tema (protótipo _tile.dot)', () => {
    const { container } = render(<KindCard label="Chegada a um lugar" tint={teal} />);
    const dot = container.querySelector<HTMLElement>('.cds-kind-card-dot');
    // jsdom normaliza o hex para rgb(): #4E7A6A → rgb(78, 122, 106)
    expect(dot?.style.background).toBe('rgb(78, 122, 106)');
  });

  it('a variante none-fit é tracejada e não tem ponto de cor', () => {
    const { container } = render(<KindCard label="Nenhum se encaixa" noneFit />);
    const radio = screen.getByRole('radio', { name: 'Nenhum se encaixa' });
    expect(radio.getAttribute('data-variant')).toBe('none-fit');
    expect(container.querySelector('.cds-pearl')).toBeNull();
  });
});
