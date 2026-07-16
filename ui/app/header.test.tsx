import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './header';

describe('Header', () => {
  it('não tem título — a marca é só o ícone', () => {
    const { container } = render(
      <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.cds-header-icon svg')).not.toBeNull();
  });

  it('o pill Histórias volta ao dashboard', () => {
    const onBack = vi.fn();
    render(<Header muted={false} onToggleMuted={() => {}} onBack={onBack} />);

    const back = screen.getByRole('button', { name: 'Voltar às histórias' });
    expect(back.textContent).toContain('Histórias');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('o toggle de som reflete o estado e alterna ao clicar', () => {
    const onToggleMuted = vi.fn();
    const { rerender } = render(
      <Header muted={false} onToggleMuted={onToggleMuted} onBack={() => {}} />,
    );

    const toggle = screen.getByRole('button', { name: 'Desligar o som da interface' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleMuted).toHaveBeenCalledTimes(1);

    rerender(<Header muted={true} onToggleMuted={onToggleMuted} onBack={() => {}} />);
    const pressed = screen.getByRole('button', { name: 'Ligar o som da interface' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
  });
});
