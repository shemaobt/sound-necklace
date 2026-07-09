import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfidenceTrio } from './confidence-trio';

describe('ConfidenceTrio — confiança em três formas (redesign §4.4, §6.4)', () => {
  it('apresenta as três escolhas como um grupo de rádio', () => {
    render(<ConfidenceTrio />);
    expect(screen.getByRole('radiogroup')).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Certeza' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Quase' })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Na dúvida' })).toBeDefined();
  });

  it('marca a escolha atual e deixa as outras desmarcadas', () => {
    render(<ConfidenceTrio value="quase" />);
    expect(screen.getByRole('radio', { name: 'Quase', checked: true })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Certeza', checked: false })).toBeDefined();
    expect(screen.getByRole('radio', { name: 'Na dúvida', checked: false })).toBeDefined();
  });

  it('selecionar emite o token presentacional correspondente', async () => {
    const onSelect = vi.fn();
    render(<ConfidenceTrio onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Certeza' }));
    expect(onSelect).toHaveBeenCalledWith('certeza');
    await userEvent.click(screen.getByRole('radio', { name: 'Na dúvida' }));
    expect(onSelect).toHaveBeenLastCalledWith('duvida');
  });

  it('a seta move a seleção e o foco pelo grupo (roving tabindex)', async () => {
    const onSelect = vi.fn();
    render(<ConfidenceTrio value="certeza" onSelect={onSelect} />);
    const certeza = screen.getByRole('radio', { name: 'Certeza' });
    certeza.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('quase');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Quase' }));
  });

  it('só a escolha atual entra na ordem de tabulação', () => {
    render(<ConfidenceTrio value="quase" />);
    expect(screen.getByRole('radio', { name: 'Quase' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('radio', { name: 'Certeza' }).getAttribute('tabindex')).toBe('-1');
  });
});
