import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beadPosition, resolveWindow, SIZE_M } from './geometry';
import { Necklace, type NecklaceProps } from './necklace';

/**
 * Testes de interação em Chromium real (Vitest browser mode) — obrigatórios para
 * o organismo crítico (CLAUDE.md gate 4). jsdom não tem layout: aqui as contas têm
 * geometria de verdade, então despachamos PointerEvents nativos por coordenada
 * (userEvent do Playwright não aceita clientX/clientY) e afirmamos o índice
 * reportado, o dwell do hover, o head-tap, a iluminação imperativa e a delegação.
 */

const WIDTH = 500; // slot 25 → 20 contas por linha

function mount(props: NecklaceProps): { host: HTMLDivElement; root: Root; el: HTMLElement } {
  const host = document.createElement('div');
  host.style.width = `${WIDTH}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Necklace {...props} />));
  const el = host.querySelector('.cds-necklace') as HTMLElement;
  return { host, root, el };
}

function firePointer(el: HTMLElement, type: string, clientX: number, clientY: number): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      buttons: type === 'pointerdown' ? 1 : 0,
    }),
  );
}

/** Coordenada de cliente do centro da conta `index`, dada a janela em uso. */
function beadClient(
  el: HTMLElement,
  index: number,
  winS: number,
  bpr = 20,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const pos = beadPosition(index, winS, bpr, SIZE_M);
  return { x: rect.left + pos.left, y: rect.top + pos.top };
}

describe('Necklace — modelo de clique delegado', () => {
  it('pointer-down numa conta reporta o índice correto através das linhas', () => {
    const onBeadPointerDown = vi.fn();
    const { root, el } = mount({ totalBeads: 60, beadSec: 0.25, onBeadPointerDown });
    // conta 43 = linha 2, coluna 3 (janela inteira, winS 0)
    const { x, y } = beadClient(el, 43, 0);
    firePointer(el, 'pointerdown', x, y);
    expect(onBeadPointerDown).toHaveBeenCalledWith(43);
    root.unmount();
  });

  it('reporta o índice global mesmo quando a janela começa deslocada (window offset)', () => {
    const onBeadPointerDown = vi.fn();
    const { winS } = resolveWindow(100, 0.25, { s: 22, e: 30 }); // winS 14
    const { root, el } = mount({
      totalBeads: 100,
      beadSec: 0.25,
      window: { s: 22, e: 30 },
      onBeadPointerDown,
    });
    // primeira conta da janela deslocada → índice global 14
    const { x, y } = beadClient(el, winS, winS);
    firePointer(el, 'pointerdown', x, y);
    expect(onBeadPointerDown).toHaveBeenCalledWith(winS);
    root.unmount();
  });

  it('tocar a cabeça brilhante dispara onHeadTap, não onBeadPointerDown', () => {
    const onBeadPointerDown = vi.fn();
    const onHeadTap = vi.fn();
    const { root, el } = mount({
      totalBeads: 40,
      beadSec: 0.25,
      playbackHead: 7,
      onBeadPointerDown,
      onHeadTap,
    });
    const head = beadClient(el, 7, 0);
    firePointer(el, 'pointerdown', head.x, head.y);
    expect(onHeadTap).toHaveBeenCalledTimes(1);
    expect(onBeadPointerDown).not.toHaveBeenCalled();

    // tocar outra conta continua reportando pointer-down normal
    const other = beadClient(el, 8, 0);
    firePointer(el, 'pointerdown', other.x, other.y);
    expect(onBeadPointerDown).toHaveBeenCalledWith(8);
    root.unmount();
  });

  it('modo transporte reporta pointer-down sem afordâncias de seleção', () => {
    const onBeadPointerDown = vi.fn();
    const { root, el, host } = mount({
      totalBeads: 40,
      beadSec: 0.25,
      transportOnly: true,
      selection: { s: 5, e: 10 },
      onBeadPointerDown,
    });
    // sem banda de seleção nem contas de borda enfatizadas
    expect(host.querySelector('.cds-necklace-selection-band')).toBeNull();
    expect(host.querySelector('[data-sel-edge="true"]')).toBeNull();
    // ainda reporta o toque (transporte)
    const { x, y } = beadClient(el, 12, 0);
    firePointer(el, 'pointerdown', x, y);
    expect(onBeadPointerDown).toHaveBeenCalledWith(12);
    root.unmount();
  });
});

describe('Necklace — centragem e hit-test leem a mesma largura', () => {
  /**
   * A largura que centra o campo no render e a que o hit-test usa têm de ser a
   * MESMA medida. Uma borda no contêiner (ou uma barra de rolagem) separa
   * `clientWidth` de `getBoundingClientRect().width` — e a caixa onde as contas
   * vivem (a de padding) deixa de começar em `rect.left`. As coordenadas aqui vêm
   * do rect real da conta, não da geometria replicada: se o mapeamento deslocar,
   * o toque cai na vizinha.
   */
  // a borda entra por folha de estilo e sai SEMPRE — se vazasse para os testes
  // seguintes, quebraria a geometria deles
  const style = document.createElement('style');
  style.textContent = '.cds-necklace { border-left: 40px solid transparent; }';
  beforeEach(() => document.head.appendChild(style));
  afterEach(() => style.remove());

  function beadCenter(el: HTMLElement, index: number): { x: number; y: number } {
    const r = el.querySelector(`.cds-necklace-bead[data-idx="${index}"]`)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  it('com borda no contêiner, tocar no centro de uma conta reporta essa conta', () => {
    const onBeadPointerDown = vi.fn();
    const { root, el } = mount({ totalBeads: 60, beadSec: 0.25, onBeadPointerDown });

    for (const idx of [0, 7, 31]) {
      const { x, y } = beadCenter(el, idx);
      firePointer(el, 'pointerdown', x, y);
      expect(onBeadPointerDown).toHaveBeenLastCalledWith(idx);
    }

    root.unmount();
  });
});

describe('Necklace — hover na fronteira (dwell)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('parar ~280ms a ±1 conta de uma borda dispara onEdgeHover uma única vez, e re-arma ao sair', async () => {
    const onEdgeHover = vi.fn();
    const { root, el } = mount({
      totalBeads: 40,
      beadSec: 0.25,
      selection: { s: 5, e: 10 },
      onEdgeHover,
    });
    const near = beadClient(el, 5, 0); // sobre a borda de início
    firePointer(el, 'pointermove', near.x, near.y);
    await vi.advanceTimersByTimeAsync(279);
    expect(onEdgeHover).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onEdgeHover).toHaveBeenCalledTimes(1);
    expect(onEdgeHover).toHaveBeenCalledWith(5);

    // permanecer na mesma borda não redispara
    const near2 = beadClient(el, 6, 0);
    firePointer(el, 'pointermove', near2.x, near2.y);
    await vi.advanceTimersByTimeAsync(400);
    expect(onEdgeHover).toHaveBeenCalledTimes(1);

    // sair re-arma; voltar dispara de novo
    firePointer(el, 'pointerleave', 0, 0);
    firePointer(el, 'pointermove', near.x, near.y);
    await vi.advanceTimersByTimeAsync(280);
    expect(onEdgeHover).toHaveBeenCalledTimes(2);
    root.unmount();
  });

  it('passar de raspão (< 280ms) não dispara', async () => {
    const onEdgeHover = vi.fn();
    const { root, el } = mount({
      totalBeads: 40,
      beadSec: 0.25,
      selection: { s: 5, e: 10 },
      onEdgeHover,
    });
    const near = beadClient(el, 10, 0);
    firePointer(el, 'pointermove', near.x, near.y);
    await vi.advanceTimersByTimeAsync(200);
    expect(onEdgeHover).not.toHaveBeenCalled();
    root.unmount();
  });
});

describe('Necklace — iluminação de playback (imperativa)', () => {
  it('alimentar head=k acende as contas ≤k sem re-renderizar (identidade dos nós estável)', () => {
    const props: NecklaceProps = { totalBeads: 40, beadSec: 0.25, playbackHead: null };
    const host = document.createElement('div');
    host.style.width = `${WIDTH}px`;
    document.body.appendChild(host);
    const root = createRoot(host);
    flushSync(() => root.render(<Necklace {...props} />));

    const beadBefore = host.querySelector('.cds-necklace-bead[data-idx="0"]');
    expect(beadBefore?.getAttribute('data-play')).toBeNull();

    flushSync(() => root.render(<Necklace {...props} playbackHead={10} />));

    const beadAfter = host.querySelector('.cds-necklace-bead[data-idx="0"]');
    expect(beadAfter).toBe(beadBefore); // MESMO nó → não houve re-render do elemento
    expect(beadAfter?.getAttribute('data-play')).toBe('played');
    expect(host.querySelector('.cds-necklace-bead[data-idx="10"]')?.getAttribute('data-play')).toBe(
      'head',
    );
    expect(
      host.querySelector('.cds-necklace-bead[data-idx="11"]')?.getAttribute('data-play'),
    ).toBeNull();

    root.unmount();
    host.remove();
  });
});

describe('Necklace — desempenho e delegação', () => {
  it('renderiza ≥2400 contas com um único listener de pointerdown no container', () => {
    const calls: { el: EventTarget; type: string }[] = [];
    const orig = HTMLElement.prototype.addEventListener;
    const spy = vi.spyOn(HTMLElement.prototype, 'addEventListener').mockImplementation(function (
      this: HTMLElement,
      ...args: Parameters<typeof orig>
    ) {
      calls.push({ el: this, type: args[0] as string });
      return orig.apply(this, args);
    });

    const onBeadPointerDown = vi.fn();
    const { root, el, host } = mount({ totalBeads: 2400, beadSec: 0.25, onBeadPointerDown });

    expect(host.querySelectorAll('.cds-necklace-bead')).toHaveLength(2400);
    const ownPointerdown = calls.filter((c) => c.el === el && c.type === 'pointerdown');
    expect(ownPointerdown).toHaveLength(1);

    // delegação funciona em escala: a última conta reporta o índice final
    const { x, y } = beadClient(el, 2399, 0);
    firePointer(el, 'pointerdown', x, y);
    expect(onBeadPointerDown).toHaveBeenCalledWith(2399);

    spy.mockRestore();
    root.unmount();
  });

  it('a banda de seleção que cruza a quebra de linha rende um segmento por linha', () => {
    const { root, host } = mount({ totalBeads: 60, beadSec: 0.25, selection: { s: 18, e: 22 } });
    // com 20 contas por linha, 18–22 cruza para a linha seguinte → 2 segmentos
    expect(host.querySelectorAll('.cds-necklace-selection-band')).toHaveLength(2);
    expect(host.querySelectorAll('[data-sel-edge="true"]')).toHaveLength(2);
    root.unmount();
  });
});
