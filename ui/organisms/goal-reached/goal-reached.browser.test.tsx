import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoalReached } from './goal-reached';

/**
 * Teclado e foco da meta alcançada, em Chromium real (ENG-653). O trap de foco do
 * Radix não é testável em jsdom — não há navegação de Tab nativa —, e o Esc precisa
 * cair no lado seguro: sair pelo teclado sem querer tiraria a pessoa da pergunta em
 * que ela estava. Padrão do repo (seam-modal, pausa sugerida): createRoot/flushSync
 * + eventos nativos.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const HEADLINE = 'A meta de hoje está no cordão.';
const STATION = 'a pergunta em que eu estava';
const DASHBOARD = 'Suas histórias';

const silent = (): void => undefined;

/** O palco: a estação embaixo e um "sair" que a troca pelo painel. */
function Harness({ reached = true }: { reached?: boolean }) {
  return (
    <>
      <p id="station">{STATION}</p>
      <GoalReached
        reached={reached}
        busy={false}
        chime={silent}
        onOpenChange={silent}
        onStopForToday={() => {
          document.getElementById('station')!.textContent = DASHBOARD;
        }}
      />
    </>
  );
}

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() => root!.render(<Harness />));
}

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function dialog(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!el) throw new Error('a tela da meta alcançada não está na tela');
  return el;
}

describe('A meta alcançada — teclado e foco em Chromium real (ENG-653)', () => {
  it('abre com o foco dentro do diálogo e o trap devolve o foco que tenta escapar', async () => {
    mount();
    await vi.waitFor(() => {
      expect(dialog().contains(document.activeElement)).toBe(true);
    });

    const outside = document.createElement('button');
    outside.textContent = 'fora';
    document.body.appendChild(outside);
    outside.focus();
    await vi.waitFor(() => {
      expect(dialog().contains(document.activeElement)).toBe(true);
    });
    outside.remove();
  });

  it('Esc faz o mesmo que "Seguir mais um pouco": fecha e deixa a pessoa onde estava', async () => {
    mount();
    await vi.waitFor(() => {
      expect(dialog().contains(document.activeElement)).toBe(true);
    });

    // o Esc do Radix chega por um listener fora do React: a barreira é o diálogo
    // sair do DOM, não um tempo de espera
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    expect(document.getElementById('station')!.textContent).toBe(STATION);
    expect(document.body.textContent).not.toContain(HEADLINE);
  });
});
