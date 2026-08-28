import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BreakSuggestion, BREAK_AFTER_MS } from './break-suggestion';

/**
 * Teclado e foco da pausa sugerida, em Chromium real (ENG-650). O trap de foco
 * do Radix não é testável em jsdom — não há navegação de Tab nativa —, e o Esc
 * precisa cair no lado seguro: sair pelo teclado sem querer perderia a estação
 * em que a pessoa estava. Padrão do repo (seam-modal): createRoot/flushSync +
 * eventos nativos.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const HEADLINE = 'Já foi bastante coisa boa por agora.';
const STATION = 'a pergunta em que eu estava';
const DASHBOARD = 'Suas histórias';

/** O palco: a estação embaixo e um "sair" que a troca pelo painel. */
function Harness() {
  return (
    <>
      <p id="station">{STATION}</p>
      <BreakSuggestion
        busy={false}
        onTakeBreak={() => {
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
  vi.useRealTimers();
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function dialog(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!el) throw new Error('a sugestão de pausa não está na tela');
  return el;
}

/** Monta e deixa o limiar passar — a sugestão fica na tela. */
function mountPastThreshold(): void {
  vi.useFakeTimers();
  mount();
  flushSync(() => {
    vi.advanceTimersByTime(BREAK_AFTER_MS + 60_000);
  });
  vi.useRealTimers();
}

describe('A pausa sugerida — teclado e foco em Chromium real (ENG-650)', () => {
  it('abre com o foco dentro do diálogo e o trap devolve o foco que tenta escapar', async () => {
    mountPastThreshold();
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

  it('Esc fecha e deixa a pessoa onde ela estava — nunca leva embora', async () => {
    mountPastThreshold();

    // o Esc do Radix chega por um listener fora do React: a barreira é o diálogo
    // sair do DOM, não um tempo de espera
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    expect(document.getElementById('station')!.textContent).toBe(STATION);
    expect(document.body.textContent).not.toContain(HEADLINE);
  });

  it('depois do Esc, a sugestão não volta nesta sessão', async () => {
    vi.useFakeTimers();
    mount();
    flushSync(() => {
      vi.advanceTimersByTime(BREAK_AFTER_MS + 60_000);
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.useRealTimers();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    vi.useFakeTimers();
    flushSync(() => {
      vi.advanceTimersByTime(BREAK_AFTER_MS + 60_000);
    });
    vi.useRealTimers();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
