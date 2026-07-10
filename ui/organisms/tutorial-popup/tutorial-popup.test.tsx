import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TutorialPopup } from './tutorial-popup';

// O Popper interno do Radix precisa de ResizeObserver; o jsdom não o implementa.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const STORAGE_KEY = 'colar-de-sons:tutorial:dismissed:v1';

function tip(): HTMLElement | null {
  return screen.queryByRole('dialog');
}

describe('TutorialPopup', () => {
  it('auto-abre com a dica da estação atual', () => {
    render(<TutorialPopup station="escuta1" />);
    const aberto = tip();
    expect(aberto).not.toBeNull();
    expect(aberto?.textContent?.length).toBeGreaterThan(0);
  });

  it('a dica muda quando a estação muda', () => {
    const { rerender } = render(<TutorialPopup station="escuta1" />);
    const primeira = tip()?.textContent;
    rerender(<TutorialPopup station="triagem" />);
    const segunda = tip()?.textContent;
    expect(segunda?.length).toBeGreaterThan(0);
    expect(segunda).not.toBe(primeira);
  });

  it('estação sem dica não renderiza nada', () => {
    const { container } = render(<TutorialPopup station="login" />);
    expect(container.firstChild).toBeNull();
  });

  it('auto-abrir não rouba o foco da facilitadora', () => {
    render(<TutorialPopup station="escuta1" />);
    expect(tip()).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('fechar esconde a dica pela sessão, mesmo trocando de estação', () => {
    const { rerender } = render(<TutorialPopup station="escuta1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar dica' }));
    expect(tip()).toBeNull();
    rerender(<TutorialPopup station="triagem" />);
    expect(tip()).toBeNull();
    // o gatilho de reencontro permanece disponível
    expect(screen.getByRole('button', { name: 'Como funciona esta etapa' })).toBeDefined();
  });

  it('ESC esconde a dica', () => {
    render(<TutorialPopup station="escuta1" />);
    const aberto = tip();
    expect(aberto).not.toBeNull();
    fireEvent.keyDown(aberto!, { key: 'Escape' });
    expect(tip()).toBeNull();
  });

  it('o gatilho reabre a dica depois de fechada', () => {
    render(<TutorialPopup station="escuta1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar dica' }));
    expect(tip()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Como funciona esta etapa' }));
    expect(tip()).not.toBeNull();
  });

  it('"não mostrar de novo" persiste entre remontagens (storage) e mantém o gatilho', () => {
    const primeiro = render(<TutorialPopup station="escuta1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar de novo' }));
    expect(tip()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    primeiro.unmount();
    render(<TutorialPopup station="escuta1" />);
    expect(tip()).toBeNull();
    // reabertura explícita continua possível (a informação não se perde)
    fireEvent.click(screen.getByRole('button', { name: 'Como funciona esta etapa' }));
    expect(tip()).not.toBeNull();
  });

  it('storage indisponível degrada em silêncio: dica aparece e o fechar ainda funciona', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    render(<TutorialPopup station="escuta1" />);
    expect(tip()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar de novo' }));
    expect(tip()).toBeNull();
  });

  it.each(['escuta1', 'escuta2', 'triagem', 'segmentacao', 'mapeamento', 'export'])(
    'não expõe dígitos em texto, aria-label ou title (%s)',
    (station) => {
      render(<TutorialPopup station={station} />);
      expect(document.body.textContent ?? '').not.toMatch(/\d/);
      for (const el of document.body.querySelectorAll('[aria-label]')) {
        expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
      }
      for (const el of document.body.querySelectorAll('[title]')) {
        expect(el.getAttribute('title')).not.toMatch(/\d/);
      }
    },
  );
});
