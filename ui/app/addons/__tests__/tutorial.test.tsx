import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildBeads, createSession, type SessionState } from '../../../../domain';
import { sessionStore } from '../../../state';
import { AddonsLayer } from '../../addons-layer';
import TutorialAddon from '../tutorial';

// Este teste vive em __tests__/ porque a registry do shell faz glob de
// /ui/app/addons/*.tsx (um nível) — um .tsx irmão do addon seria importado
// eagerly pelo app como se fosse um addon.

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
  sessionStore.setState(sessionStore.getInitialState(), true);
});

function sampleSession(confirmed = false): SessionState {
  const session = createSession({
    durationSec: 4,
    beadSec: 0.25,
    beads: buildBeads(4, 0.25),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return confirmed ? { ...session, whole: { ...session.whole, confirmed: true } } : session;
}

describe('addon de tutorial', () => {
  it('sem sessão não renderiza nada', () => {
    const { container } = render(<TutorialAddon />);
    expect(container.firstChild).toBeNull();
  });

  it('monta na camada de overlay, nunca dentro do conteúdo da estação', () => {
    sessionStore.getState().load(sampleSession());
    const { container } = render(
      <div>
        <main>conteúdo da estação</main>
        <AddonsLayer addons={[TutorialAddon]} />
      </div>,
    );
    const layer = container.querySelector('.cds-addons-layer');
    expect(layer).not.toBeNull();
    expect(layer!.contains(screen.getByRole('dialog'))).toBe(true);
    expect(layer!.contains(screen.getByRole('button', { name: 'Como funciona esta etapa' }))).toBe(
      true,
    );
    const main = container.querySelector('main')!;
    expect(main.querySelector('[role="dialog"]')).toBeNull();
    expect(main.querySelector('button')).toBeNull();
  });

  it('a dica acompanha a estação atual derivada da sessão', () => {
    sessionStore.getState().load(sampleSession(false));
    const antes = render(<TutorialAddon />);
    const dicaOuvir = screen.getByRole('dialog').textContent;
    antes.unmount();

    sessionStore.getState().load(sampleSession(true));
    render(<TutorialAddon />);
    const dicaCortar = screen.getByRole('dialog').textContent;

    expect(dicaCortar?.length).toBeGreaterThan(0);
    expect(dicaCortar).not.toBe(dicaOuvir);
  });
});
