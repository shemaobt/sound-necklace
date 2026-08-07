import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NavFooterOutlet, NavFooterProvider, StationNav } from './nav-footer';

/**
 * O rodapé de navegação (protótipo v3 §1, na versão enxuta pedida pelo dono: só
 * voltar e avançar, sem o rótulo de contexto do centro). A estação publica a sua
 * navegação por `StationNav`; o shell rende o `NavFooterOutlet`. O acoplamento é o
 * portal — a estação continua dona da ação, o shell só empresta o lugar.
 */
function shell(children: React.ReactNode) {
  return render(
    <NavFooterProvider>
      <div>{children}</div>
      <NavFooterOutlet />
    </NavFooterProvider>,
  );
}

describe('NavFooter — o lugar da navegação', () => {
  it('sem estação publicando navegação, não existe rodapé no DOM', () => {
    shell(<p>estação sem navegação</p>);
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it('a navegação publicada por uma estação aparece no rodapé, fora do corpo dela', () => {
    const { container } = shell(
      <section data-testid="corpo">
        <StationNav
          back={{ label: 'Ouvir de novo', onClick: vi.fn() }}
          next={{ label: 'Confirmar as cenas', onClick: vi.fn(), enabled: true }}
        />
      </section>,
    );
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ouvir de novo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Confirmar as cenas/ })).toBeTruthy();
    // o portal tira os botões de dentro do corpo da estação
    expect(container.querySelector('[data-testid="corpo"] button')).toBeNull();
  });

  it('voltar e avançar chamam a ação da estação', () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    shell(
      <StationNav
        back={{ label: 'Voltar', onClick: onBack }}
        next={{ label: 'Avançar', onClick: onNext, enabled: true }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  /**
   * "Nunca punir" (CLAUDE.md, regras de UI): avançar sem a condição cumprida fica
   * apagado, mas ainda CLICA — é o clique que faz a estação dizer o que falta. Um
   * `disabled` de verdade engoliria o clique e deixaria a tela muda.
   */
  it('avançar sem a condição cumprida fica apagado mas continua clicável', () => {
    const onNext = vi.fn();
    shell(<StationNav next={{ label: 'Avançar', onClick: onNext, enabled: false }} />);
    const next = screen.getByRole('button', { name: /Avançar/ });
    expect(next.getAttribute('data-enabled')).toBe('false');
    expect(next.hasAttribute('disabled')).toBe(false);
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('uma estação sem voltar publica só o avançar', () => {
    shell(<StationNav next={{ label: 'Avançar', onClick: vi.fn(), enabled: true }} />);
    expect(screen.getByRole('button', { name: /Avançar/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Voltar/ })).toBeNull();
  });

  it('a estação que sai leva a navegação dela junto', () => {
    const { rerender } = render(
      <NavFooterProvider>
        <StationNav next={{ label: 'Avançar', onClick: vi.fn(), enabled: true }} />
        <NavFooterOutlet />
      </NavFooterProvider>,
    );
    expect(screen.getByRole('button', { name: /Avançar/ })).toBeTruthy();
    rerender(
      <NavFooterProvider>
        <p>outra estação</p>
        <NavFooterOutlet />
      </NavFooterProvider>,
    );
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });
});
