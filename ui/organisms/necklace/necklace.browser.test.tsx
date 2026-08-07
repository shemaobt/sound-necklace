import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { Span } from '../../../domain';
import { beadPosition, beadsPerRow, resolveWindow, SIZE_M } from './geometry';
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
/**
 * Centro real da conta, lido do DOM.
 *
 * Já foi calculado a partir de um `bpr` fixo de 20 — e isso amarrava o teste a
 * uma largura útil exata. Bastou a janela reservar a calha da barra de rolagem
 * (`scrollbar-gutter`, que só aparece onde a barra é clássica, não no macOS) para
 * a fileira caber 19 contas: as coordenadas passaram a apontar para a conta
 * errada, no CI e só no CI.
 */
function beadClient(el: HTMLElement, index: number, winS: number): { x: number; y: number } {
  const bead = el.querySelector(`.cds-necklace-bead[data-idx="${index}"]`);
  if (bead) {
    const r = bead.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // fora da janela renderizada: cai na geometria, medindo o bpr em vigor
  const rect = el.getBoundingClientRect();
  const bpr = beadsPerRow(el.clientWidth, SIZE_M);
  // o tamanho da janela sai do próprio DOM (uma conta renderizada por índice), que é
  // o que a geometria precisa para centrar a fileira incompleta (protótipo v3 §4)
  const winE = winS + el.querySelectorAll('.cds-necklace-bead').length - 1;
  const pos = beadPosition(index, winS, winE, bpr, SIZE_M);
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
   * do rect real da conta, não da geometria replicada: se o conversation deslocar,
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

  /**
   * O dwell nasceu quando hover e clique CONCORDAVAM (referência L587-596: clicar
   * numa borda também tocava só a borda). No nosso modelo eles discordam — clicar o
   * começo OUVE a partir dali (docs/segmentation-rules.md regra 1) — então o timer
   * armado antes do clique tem de morrer no clique. Sem isto, na primeira
   * segmentação (seleção {s:0,e:0}: a conta 0 É borda) o clique começa a história
   * inteira e 280 ms depois o dwell atrasado a interrompe para tocar ~4 contas em
   * volta da borda — o relato "clico na primeira conta e ele só toca as primeiras".
   */
  it('clicar cancela o dwell já armado — o hover atrasado não sequestra o áudio do clique', async () => {
    const onEdgeHover = vi.fn();
    const onBeadPointerDown = vi.fn();
    const { root, el } = mount({
      totalBeads: 40,
      beadSec: 0.25,
      selection: { s: 0, e: 0 },
      onEdgeHover,
      onBeadPointerDown,
    });
    const start = beadClient(el, 0, 0);
    firePointer(el, 'pointermove', start.x, start.y); // arma o dwell na borda 0
    await vi.advanceTimersByTimeAsync(100);
    firePointer(el, 'pointerdown', start.x, start.y); // o ouvinte clica antes do dwell
    expect(onBeadPointerDown).toHaveBeenCalledWith(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(onEdgeHover).not.toHaveBeenCalled();
    root.unmount();
  });

  /**
   * Segunda metade do mesmo relato ("depois seleciona um trecho maior e ele toca só
   * as extremidades"): o clique que define o FIM transforma a conta sob o ponteiro
   * numa borda. Qualquer tremor do mouse vira pointermove e re-armaria o dwell ali
   * mesmo, interrompendo a reprodução que o clique deixou correndo. Só um hover
   * DELIBERADO — sair da conta e voltar — deve tocar a borda.
   */
  it('tremor sobre a conta recém-clicada não re-arma o dwell; sair e voltar re-arma', async () => {
    const onEdgeHover = vi.fn();
    const { root, el } = mount({
      totalBeads: 40,
      beadSec: 0.25,
      selection: { s: 0, e: 12 },
      onEdgeHover,
    });
    const end = beadClient(el, 12, 0);
    firePointer(el, 'pointerdown', end.x, end.y); // define o FIM em 12
    firePointer(el, 'pointermove', end.x, end.y); // tremor do mouse na mesma conta
    await vi.advanceTimersByTimeAsync(400);
    expect(onEdgeHover).not.toHaveBeenCalled();

    // sair para longe da borda e voltar = intenção deliberada de conferir a borda
    const far = beadClient(el, 6, 0);
    firePointer(el, 'pointermove', far.x, far.y);
    firePointer(el, 'pointermove', end.x, end.y);
    await vi.advanceTimersByTimeAsync(280);
    expect(onEdgeHover).toHaveBeenCalledWith(12);
    root.unmount();
  });

  /**
   * O relato de 2026-08-07: "clico na conta e a história não se desenrola, toca só o
   * início — mas depois de algumas tentativas funciona". A supressão do clique é por
   * CONTA, o gatilho do dwell é por VIZINHANÇA (±1 conta da borda): o ponteiro
   * escorregar uma conta — tirar a mão do mouse depois de clicar — sai da conta
   * suprimida e continua dentro da zona da MESMA borda, re-armando o dwell que corta
   * a escuta 280 ms depois. Intermitente porque depende de o ponteiro ficar parado.
   * Só sair da ZONA da borda e voltar é hover deliberado.
   */
  it('escorregar para a conta vizinha não ressuscita o dwell da borda recém-clicada', async () => {
    const onEdgeHover = vi.fn();
    const onBeadPointerDown = vi.fn();
    const { root, el } = mount({
      totalBeads: 40,
      beadSec: 0.25,
      selection: { s: 0, e: 0 }, // primeira segmentação: a conta 0 É borda
      onEdgeHover,
      onBeadPointerDown,
    });
    const start = beadClient(el, 0, 0);
    firePointer(el, 'pointerdown', start.x, start.y); // OUVIR dali até o fim da história
    expect(onBeadPointerDown).toHaveBeenCalledWith(0);

    const vizinha = beadClient(el, 1, 0); // ainda a ±1 da borda 0
    firePointer(el, 'pointermove', vizinha.x, vizinha.y);
    await vi.advanceTimersByTimeAsync(400);
    expect(onEdgeHover).not.toHaveBeenCalled();

    // sair da ZONA da borda e voltar = intenção deliberada de conferir a borda
    const fora = beadClient(el, 6, 0);
    firePointer(el, 'pointermove', fora.x, fora.y);
    firePointer(el, 'pointermove', vizinha.x, vizinha.y);
    await vi.advanceTimersByTimeAsync(280);
    expect(onEdgeHover).toHaveBeenCalledWith(0);
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
    /* Restaura mesmo se a asserção falhar antes do fim. Sem isto, o espião
       sobrevive ao teste e a repetição (`retry: 1`) captura o PRÓPRIO espião como
       "original": cada addEventListener chama o anterior e a pilha estoura, o que
       esconde a falha de verdade atrás de um "Maximum call stack size exceeded". */
    onTestFinished(() => {
      HTMLElement.prototype.addEventListener = orig;
    });
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

/**
 * ENG-387 — uma história longa não pode empurrar título, botão de tocar e
 * confirmação para fora da tela: as contas rolam dentro da própria janela e a
 * conta acesa é trazida de volta sozinha. Só Chromium prova isto: em jsdom a
 * janela não tem altura, nem `scrollTop`, nem rolagem suave.
 */
describe('Necklace — janela rolável que segue a conta acesa (ENG-387)', () => {
  const MAX_H = 200;
  const LONGA: NecklaceProps = { totalBeads: 400, beadSec: 0.25, maxHeight: MAX_H };

  interface Mounted {
    root: Root;
    host: HTMLDivElement;
    win: HTMLElement;
    el: HTMLElement;
    /** re-renderiza a MESMA árvore: a cabeça muda sem remontar o campo de contas */
    feed: (head: number | null) => void;
  }

  // sem isto, um teste que falha deixa o host no documento e desloca a janela do
  // seguinte — a asserção seguinte falharia por herança, não por regressão
  const abertos: Mounted[] = [];
  afterEach(() => {
    for (const m of abertos.splice(0)) {
      m.root.unmount();
      m.host.remove();
    }
    vi.unstubAllGlobals();
  });

  function open(extra: Partial<NecklaceProps> = {}): Mounted {
    const host = document.createElement('div');
    host.style.width = `${WIDTH}px`;
    document.body.appendChild(host);
    const root = createRoot(host);
    const feed = (head: number | null): void => {
      flushSync(() => root.render(<Necklace {...LONGA} {...extra} playbackHead={head} />));
    };
    feed(null);
    const m: Mounted = {
      root,
      host,
      feed,
      win: host.querySelector('.cds-necklace-window') as HTMLElement,
      el: host.querySelector('.cds-necklace') as HTMLElement,
    };
    abertos.push(m);
    return m;
  }

  it('mudar a seleção com a reprodução pausada não arrasta a janela de volta', () => {
    /* A cabeça SOBREVIVE à pausa (o player só a limpa no stop), e o efeito também
       roda quando o campo se recompõe. Sem guarda, este percurso real puxava a
       janela para longe: pausar lá no fim, rolar de volta ao começo para conferir
       um trecho, e tocar numa conta para cortar — o corte acontecia e a janela
       fugia para o ponto pausado, por cima da conta recém-escolhida. */
    /* Movimento reduzido de propósito: com `smooth` o `scrollTo` é assíncrono e
       `scrollTop` ainda vale 0 logo após o render — a asserção passaria mesmo com
       a guarda removida, medindo cedo demais em vez de medir a guarda. Com
       `reduce` a rolagem é instantânea e o efeito fica observável. */
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const host = document.createElement('div');
    host.style.width = `${WIDTH}px`;
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = (selection: Span | null): void => {
      flushSync(() =>
        root.render(<Necklace {...LONGA} playbackHead={380} selection={selection} />),
      );
    };

    render(null);
    const win = host.querySelector('.cds-necklace-window') as HTMLElement;
    // o ouvinte volta ao começo com o dedo, de propósito
    win.scrollTop = 0;

    // e toca numa conta lá em cima: muda a seleção, a cabeça pausada não anda
    render({ s: 4, e: 8 });

    expect(win.scrollTop, 'a janela fugiu da conta que a pessoa acabou de tocar').toBe(0);

    root.unmount();
    host.remove();
  });

  /** Retângulo real da conta — imune ao nº de contas por fileira e à rolagem. */
  function beadRect(el: HTMLElement, index: number): DOMRect {
    const bead = el.querySelector(`.cds-necklace-bead[data-idx="${index}"]`);
    if (!bead) throw new Error(`conta ${index} não renderizada`);
    return bead.getBoundingClientRect();
  }

  function visible(win: HTMLElement, bead: DOMRect): boolean {
    const janela = win.getBoundingClientRect();
    return bead.top >= janela.top && bead.bottom <= janela.bottom;
  }

  it('quem rola é a janela do colar, e ela não cresce além do teto pedido', () => {
    const { win } = open();

    expect(win.clientHeight).toBe(MAX_H);
    expect(win.scrollHeight).toBeGreaterThan(MAX_H);
  });

  it('tocar uma conta DEPOIS de rolar reporta essa conta, não a vizinha', () => {
    const onBeadPointerDown = vi.fn();
    const { win, el } = open({ onBeadPointerDown });

    win.scrollTop = 300;

    for (const idx of [220, 221, 240]) {
      const r = beadRect(el, idx);
      firePointer(el, 'pointerdown', r.left + r.width / 2, r.top + r.height / 2);
      expect(onBeadPointerDown).toHaveBeenLastCalledWith(idx);
    }
  });

  it('a conta acesa que passou abaixo da borda traz a janela até ela', async () => {
    const { win, el, feed } = open();
    expect(win.scrollTop).toBe(0);
    expect(visible(win, beadRect(el, 300))).toBe(false);

    feed(300);

    // a rolagem é suave: espera-se o repouso, não o primeiro frame
    await expect.poll(() => visible(win, beadRect(el, 300))).toBe(true);
    expect(win.scrollTop).toBeGreaterThan(0);
  });

  it('conta acesa já à vista não rouba a rolagem de quem foi olhar outro trecho', async () => {
    const { win, el, feed } = open();

    // o usuário rolou até aqui; a conta escolhida é uma que está à vista DAQUI
    win.scrollTop = 400;
    const aVista = Array.from(el.querySelectorAll<HTMLElement>('.cds-necklace-bead')).find((b) =>
      visible(win, b.getBoundingClientRect()),
    )!;

    feed(Number(aVista.dataset.idx));

    await new Promise((r) => setTimeout(r, 150));
    expect(win.scrollTop).toBe(400);
  });

  it('quem pediu menos movimento não vê a janela deslizar: ela salta na hora', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /reduce/.test(q), media: q }));
    const { win, feed } = open();

    feed(300);

    // sem esperar frame algum: rolagem suave ainda estaria em zero neste instante
    expect(win.scrollTop).toBeGreaterThan(0);
  });
});

describe('Necklace — arrastar fronteira (ENG-342)', () => {
  it('arrastar um punho reporta (id, conta-alvo) e não dispara o toque', () => {
    const onDragBoundary = vi.fn();
    const onBeadPointerDown = vi.fn();
    const { root, el } = mount({
      totalBeads: 60,
      beadSec: 0.25,
      dragHandles: [{ at: 10, id: 'PT1' }],
      onDragBoundary,
      onBeadPointerDown,
    });
    const down = beadClient(el, 10, 0);
    const to = beadClient(el, 14, 0);
    firePointer(el, 'pointerdown', down.x, down.y);
    firePointer(el, 'pointermove', to.x, to.y);
    firePointer(el, 'pointerup', to.x, to.y);
    expect(onDragBoundary).toHaveBeenCalledWith('PT1', 14);
    expect(onBeadPointerDown).not.toHaveBeenCalled();
    root.unmount();
  });

  it('tocar um punho sem arrastar preserva o toque da conta (ENG-347)', () => {
    const onDragBoundary = vi.fn();
    const onBeadPointerDown = vi.fn();
    const { root, el } = mount({
      totalBeads: 60,
      beadSec: 0.25,
      dragHandles: [{ at: 10, id: 'PT1' }],
      onDragBoundary,
      onBeadPointerDown,
    });
    const at = beadClient(el, 10, 0);
    firePointer(el, 'pointerdown', at.x, at.y);
    firePointer(el, 'pointerup', at.x, at.y);
    expect(onDragBoundary).not.toHaveBeenCalled();
    expect(onBeadPointerDown).toHaveBeenCalledWith(10);
    root.unmount();
  });

  it('sem punho por perto, a conta se comporta como toque normal', () => {
    const onDragBoundary = vi.fn();
    const onBeadPointerDown = vi.fn();
    const { root, el } = mount({
      totalBeads: 60,
      beadSec: 0.25,
      dragHandles: [{ at: 10, id: 'PT1' }],
      onDragBoundary,
      onBeadPointerDown,
    });
    const far = beadClient(el, 3, 0);
    firePointer(el, 'pointerdown', far.x, far.y);
    expect(onBeadPointerDown).toHaveBeenCalledWith(3);
    expect(onDragBoundary).not.toHaveBeenCalled();
    root.unmount();
  });
});
