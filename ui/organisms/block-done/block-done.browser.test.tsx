import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { scenePalette } from '../../tokens';
import { BlockDone } from './block-done';

/**
 * Teclado e foco da tela de fim de bloco, em Chromium real (ENG-651). O trap de
 * foco do Radix não é testável em jsdom (não há navegação de Tab nativa), e aqui
 * o Esc precisa cair do lado que CONTINUA: a estação seguinte já está atrás da
 * tela, e sair sem querer pelo teclado levaria a pessoa ao painel. Padrão do
 * repo (seam-modal, pausa sugerida): createRoot/flushSync + eventos nativos.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const PRIMARY = 'Seguir para as frases';

const continued = { count: 0 };
const rested = { count: 0 };

function mount(): void {
  continued.count = 0;
  rested.count = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      <BlockDone
        block="triagem"
        tints={scenePalette.slice(0, 3)}
        onContinue={() => (continued.count += 1)}
        onRest={() => (rested.count += 1)}
      />,
    ),
  );
}

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function dialog(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!el) throw new Error('a tela de fim de bloco não está na tela');
  return el;
}

function button(name: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll('button')].find((b) => b.textContent === name);
  if (!found) throw new Error(`sem botão "${name}"`);
  return found;
}

describe('BlockDone — teclado e foco em Chromium real (ENG-651)', () => {
  it('abre com o foco no botão que continua, não no que leva embora', async () => {
    mount();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(button(PRIMARY));
    });
  });

  it('o trap devolve o foco que tenta escapar do diálogo', async () => {
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

  it('Esc continua para a estação já chegada — nunca guarda e sai', async () => {
    mount();
    // o Esc do Radix chega por um listener fora do React: a barreira é o diálogo
    // sair do DOM, não um tempo de espera
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => {
      expect(continued.count).toBe(1);
    });
    expect(rested.count).toBe(0);
  });
});
