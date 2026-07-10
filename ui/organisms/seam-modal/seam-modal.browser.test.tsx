import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BorderOffer } from '../../../domain';
import { SeamModal, type SeamModalProps } from './seam-modal';

/**
 * Testes de interação em Chromium real — obrigatórios para o seam modal (uma
 * das três superfícies interaction-critical do CLAUDE.md). Padrão do repo:
 * createRoot/flushSync + eventos nativos (sem vitest-browser-react). O focus
 * trap do Radix não é testável em jsdom (sem navegação de Tab nativa) — aqui
 * provamos o trap de verdade.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function makeOffer(over: Partial<BorderOffer> = {}): BorderOffer {
  return {
    fraseIndex: 0,
    sel: { s: 12, e: 26 },
    crossStart: false,
    crossEnd: true,
    delta: 2,
    thr: 4,
    consumed: false,
    kind: 'simple',
    canMove: true,
    question: 'Esta frase passa o fim da cena (Encounter). O tipo continua aqui?',
    warning: null,
    ...over,
  };
}

function baseProps(over: Partial<SeamModalProps> = {}): SeamModalProps {
  return {
    offer: makeOffer(),
    scene: { span: { s: 10, e: 24 }, tint: { base: '#BE4A01', lit: '#E8813E', deep: '#853401' } },
    neighbor: {
      span: { s: 25, e: 40 },
      tint: { base: '#777D45', lit: '#9AA05E', deep: '#53572F' },
    },
    onMove: vi.fn(),
    onReanchor: vi.fn(),
    onGoTriagem: vi.fn(),
    ...over,
  };
}

function mount(props: SeamModalProps): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() => root!.render(<SeamModal {...props} />));
}

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function dialog(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!el) throw new Error('diálogo não encontrado');
  return el;
}

function byText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!found) throw new Error(`botão "${text}" não encontrado`);
  return found;
}

describe('SeamModal — interação em Chromium real (CLAUDE.md gate 4)', () => {
  it('abre com o foco dentro do diálogo e o trap devolve o foco que tenta escapar', async () => {
    mount(baseProps());
    await vi.waitFor(() => {
      expect(dialog().contains(document.activeElement)).toBe(true);
    });

    // um alvo focável fora do diálogo: o trap do Radix precisa puxar de volta
    const outside = document.createElement('button');
    outside.textContent = 'fora';
    document.body.appendChild(outside);
    outside.focus();
    await vi.waitFor(() => {
      expect(dialog().contains(document.activeElement)).toBe(true);
    });
    outside.remove();
  });

  it('clique nativo em "Mover a borda até aqui" dispara onMove uma vez', () => {
    const props = baseProps();
    mount(props);
    byText('Mover a borda até aqui').click();
    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onReanchor).not.toHaveBeenCalled();
  });

  it('ESC e pointer-down no overlay caem no onReanchor (default seguro)', async () => {
    const props = baseProps();
    mount(props);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(props.onReanchor).toHaveBeenCalledTimes(1);

    // o listener de fora é registrado num setTimeout(0)
    await new Promise((r) => setTimeout(r, 10));
    const overlay = document.querySelector<HTMLElement>('.cds-seam-modal-overlay');
    expect(overlay).not.toBeNull();
    // clique real = pointerdown + click; o modal difere a dispensa para o click
    overlay!.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      }),
    );
    overlay!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await vi.waitFor(() => {
      expect(props.onReanchor).toHaveBeenCalledTimes(2);
    });
  });
});
