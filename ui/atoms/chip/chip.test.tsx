import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Chip } from './chip';

const sage = { base: '#89AAA3', lit: '#B2CCC6', deep: '#5F827B' };

describe('Chip — pílula de cena/frase (redesign §6.3)', () => {
  it('renderiza como botão acessível pelo rótulo', () => {
    render(<Chip label="Cena da fogueira" />);
    expect(screen.getByRole('button', { name: 'Cena da fogueira' })).toBeDefined();
  });

  it('mostra o swatch-pérola tingido quando recebe a cor do segmento', () => {
    const { container } = render(<Chip label="Cena da fogueira" swatch={sage} />);
    const tinted = [...container.querySelectorAll<HTMLElement>('.cds-chip *')].filter(
      (el) => el.style.getPropertyValue('--cds-pearl-base') === sage.base,
    );
    expect(tinted).toHaveLength(1);
  });

  it('não mostra swatch sem cor de segmento', () => {
    const { container } = render(<Chip label="Cena da fogueira" />);
    const tinted = [...container.querySelectorAll<HTMLElement>('.cds-chip *')].filter(
      (el) => el.style.getPropertyValue('--cds-pearl-base') !== '',
    );
    expect(tinted).toHaveLength(0);
  });

  it('marca a seleção (chip da cena em reprodução)', () => {
    render(<Chip label="Cena da fogueira" selected />);
    const chip = screen.getByRole('button', { name: 'Cena da fogueira' });
    expect(chip.getAttribute('data-selected')).toBe('true');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('variante tracejada para "nenhum se encaixa"', () => {
    render(<Chip label="Nenhum se encaixa" dashed />);
    const chip = screen.getByRole('button', { name: 'Nenhum se encaixa' });
    expect(chip.getAttribute('data-variant')).toBe('dashed');
  });

  it('repassa o clique (props in, events out)', async () => {
    const onClick = vi.fn();
    render(<Chip label="Cena da fogueira" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cena da fogueira' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
