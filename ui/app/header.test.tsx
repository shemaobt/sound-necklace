import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './header';

describe('Header', () => {
  it('mostra a marca do Colar de Sons', () => {
    render(<Header muted={false} onToggleMuted={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Colar de Sons' })).toBeDefined();
  });

  it('o toggle de som reflete o estado e alterna ao clicar', () => {
    const onToggleMuted = vi.fn();
    const { rerender } = render(<Header muted={false} onToggleMuted={onToggleMuted} />);

    const toggle = screen.getByRole('button', { name: 'Desligar o som da interface' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleMuted).toHaveBeenCalledTimes(1);

    rerender(<Header muted={true} onToggleMuted={onToggleMuted} />);
    const pressed = screen.getByRole('button', { name: 'Ligar o som da interface' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
  });
});
