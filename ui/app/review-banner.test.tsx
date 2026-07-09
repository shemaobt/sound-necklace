import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewBanner } from './review-banner';

describe('ReviewBanner (PRD §8.10 / §7.3)', () => {
  it('em revisão: mostra a copy e destravar chama onUnlock', () => {
    const onUnlock = vi.fn();
    render(<ReviewBanner review={true} lock={null} onUnlock={onUnlock} />);

    expect(screen.getByRole('status').textContent).toContain(
      'Modo de revisão — a segmentação está travada.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Destravar para editar' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('travada por outro editor: mostra o dono e não oferece destravar', () => {
    render(<ReviewBanner review={true} lock={{ holder: 'Ana' }} onUnlock={() => {}} />);

    expect(screen.getByRole('status').textContent).toContain('sessão em uso por Ana');
    expect(screen.queryByRole('button', { name: 'Destravar para editar' })).toBeNull();
  });

  it('sem revisão nem trava: não renderiza nada', () => {
    const { container } = render(<ReviewBanner review={false} lock={null} onUnlock={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
