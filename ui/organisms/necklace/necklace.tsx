import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Span } from '../../../domain';
import { Pearl, type PearlState } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import {
  bandRects,
  beadAtXY,
  centerOffset,
  cordRects,
  beadPosition,
  beadsPerRow,
  followScrollTop,
  type Rect,
  resolveWindow,
  type Size,
  SIZE_M,
} from './geometry';
import './necklace.css';

/**
 * Um segmento (cena ou frase) que tinge um trecho de contas — ou, sem tinta e com
 * `noneFit`, o marca como cena fora dos tipos (ENG-725): creme tracejada até o fim.
 */
export interface NecklaceSegment {
  span: Span;
  tint?: PaletteEntry;
  noneFit?: boolean;
}

/**
 * Contrato de props do colar. Para a iluminação de playback rodar a 60fps SEM
 * re-render (o campo de contas é memoizado sem `playbackHead`), as props
 * ESTRUTURAIS — `segments`, `lockedEndBeads`, `phraseEndBeads`, `selection`,
 * `window`, `size` —
 * devem ser referencialmente estáveis entre frames: a página que dirige o
 * `playbackHead` não deve recriar esses valores inline a cada frame, ou o campo
 * recomputa e o ganho se perde.
 */
export interface NecklaceProps {
  totalBeads: number;
  beadSec: number;
  /** trechos coloridos pela paleta do segmento (§4.2) */
  segments?: NecklaceSegment[];
  /** índices de conta que terminam cenas travadas → rendem quadradas (§4.3) */
  lockedEndBeads?: number[];
  /** índices de conta que terminam FRASES travadas → quadradas encolhidas, sem
   *  anel (ENG-725). Na mesma conta o fim de cena ganha. As estações que não o
   *  passam rendem exatamente como antes. */
  phraseEndBeads?: number[];
  selection?: Span | null;
  pendingStart?: number | null;
  /** span da cena ativa (Segmentação): abre a janela cena ± margem, dim fora, banda tracejada */
  window?: Span | null;
  /** margem da janela em contas; 0 = só a cena (Triage). Padrão: max(3, 2s) */
  windowMargin?: number;
  /** banda tracejada da cena; a Triage a dispensa (a cena já vem sozinha, no cartão) */
  sceneBand?: boolean;
  /** cabeça de reprodução: acende as contas ≤ head de forma imperativa (60fps) */
  playbackHead?: number | null;
  /** modo transporte (Escuta/review): toca ao tocar, sem afordâncias de seleção */
  transportOnly?: boolean;
  size?: Size;
  /** teto em px da janela de contas: o colar rola DENTRO dela e a página não
   *  cresce, então título, botão de tocar e confirmação ficam sempre à vista.
   *  Cada estação pede o seu (a Segmentação quer uma tira mais curta que a
   *  Escuta); sem ele, o campo é inteiro e nada rola. */
  maxHeight?: number;
  /** fronteiras arrastáveis (ENG-342): `at` = conta onde o punho fica; `id` =
   *  identidade opaca que a página interpreta (o colar não sabe de cena/frase) */
  dragHandles?: DragHandle[];
  onBeadPointerDown?: (bead: number) => void;
  onEdgeHover?: (edge: number) => void;
  onHeadTap?: () => void;
  /** arrastar um punho até `toBead`; a página aplica o ajuste no domínio. `done` marca
   *  o ÚLTIMO evento do gesto (o dedo soltou), que é quando a página pode fazer som:
   *  soar a cada conta do arrasto seria um estouro. */
  onDragBoundary?: (id: string, toBead: number, done?: boolean) => void;
}

/** Um punho arrastável ancorado numa conta (ENG-342). */
export interface DragHandle {
  at: number;
  id: string;
}

interface BeadDescriptor {
  index: number;
  left: number;
  top: number;
  state: PearlState;
  tint?: PaletteEntry;
  sceneEnd: boolean;
  phraseEnd: boolean;
  noneFit: boolean;
  selEdge: boolean;
}

interface Field {
  beads: BeadDescriptor[];
  cords: Rect[];
  sceneBand: Rect[];
  selectionBand: Rect[];
  height: number;
}

function computeField(
  total: number,
  beadSec: number,
  width: number,
  size: Size,
  segments: NecklaceSegment[],
  lockedEndBeads: number[],
  phraseEndBeads: number[],
  selection: Span | null,
  window: Span | null,
  windowMargin: number | undefined,
  sceneBandOn: boolean,
): Field {
  const { winS, winE } = resolveWindow(total, beadSec, window, windowMargin);
  const bpr = beadsPerRow(width, size);
  const xOff = centerOffset(winE - winS + 1, bpr, width, size);

  const colorMap = new Map<number, PaletteEntry>();
  const noneFitSet = new Set<number>();
  for (const seg of segments) {
    for (let i = seg.span.s; i <= seg.span.e; i++) {
      if (seg.tint) colorMap.set(i, seg.tint);
      if (seg.noneFit) noneFitSet.add(i);
    }
  }
  const endSet = new Set(lockedEndBeads);
  const phraseEndSet = new Set(phraseEndBeads);

  const beads: BeadDescriptor[] = [];
  for (let i = winS; i <= winE; i++) {
    const dim = window !== null && (i < window.s || i > window.e);
    const pos = beadPosition(i, winS, winE, bpr, size);
    beads.push({
      index: i,
      left: pos.left + xOff,
      top: pos.top,
      state: dim ? 'dim' : 'unplayed',
      tint: colorMap.get(i),
      sceneEnd: endSet.has(i),
      phraseEnd: phraseEndSet.has(i),
      noneFit: noneFitSet.has(i),
      selEdge: selection !== null && (i === selection.s || i === selection.e),
    });
  }

  const shift = (r: Rect): Rect => ({ ...r, left: r.left + xOff });
  const sceneBand =
    window && sceneBandOn
      ? bandRects(Math.max(winS, window.s), Math.min(winE, window.e), winS, winE, bpr, size, 4).map(
          shift,
        )
      : [];
  const selectionBand = selection
    ? bandRects(
        Math.max(winS, selection.s),
        Math.min(winE, selection.e),
        winS,
        winE,
        bpr,
        size,
        3,
      ).map(shift)
    : [];

  const rows = Math.ceil((winE - winS + 1) / bpr);
  const cords = cordRects(winS, winE, bpr, size).map(shift);
  return { beads, cords, sceneBand, selectionBand, height: rows * size.row + 12 };
}

/** Estado vivo lido pelos listeners nativos delegados (padrão ref-mirror). */
interface Interaction {
  total: number;
  size: Size;
  /** a MESMA largura que centrou o campo no render — o hit-test não a remede */
  width: number;
  winS: number;
  winE: number;
  bpr: number;
  selection: Span | null;
  transportOnly: boolean;
  playbackHead: number | null;
  dragHandles: DragHandle[];
  onBeadPointerDown?: (bead: number) => void;
  onEdgeHover?: (edge: number) => void;
  onHeadTap?: () => void;
  onDragBoundary?: (id: string, toBead: number, done?: boolean) => void;
}

const BeadField = memo(function BeadField({ field, size }: { field: Field; size: Size }) {
  return (
    <>
      {field.cords.map((r, i) => (
        <div
          key={`cord-${i}`}
          className="cds-necklace-cord"
          style={{
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          }}
        />
      ))}
      {field.sceneBand.map((r, i) => (
        <div
          key={`scene-${i}`}
          className="cds-necklace-scene-band"
          style={{
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          }}
        />
      ))}
      {field.selectionBand.map((r, i) => (
        <div
          key={`sel-${i}`}
          className="cds-necklace-selection-band"
          style={{
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
          }}
        />
      ))}
      {field.beads.map((b) => (
        <span
          key={b.index}
          className="cds-necklace-bead"
          data-idx={b.index}
          data-sel-edge={b.selEdge || undefined}
          style={{ left: `${b.left}px`, top: `${b.top}px` }}
        >
          <Pearl
            state={b.state}
            tint={b.tint}
            size={size.bead}
            sceneEnd={b.sceneEnd}
            phraseEnd={b.phraseEnd}
            noneFit={b.noneFit}
          />
        </span>
      ))}
    </>
  );
});

/**
 * O colar — o herói (redesign §6). Contas renderizadas como DOM gerenciado pelo
 * React; a iluminação de playback é IMPERATIVA (escreve `data-play` via ref, sem
 * re-render), e um único handler de pointer delegado no container mapeia
 * pointer→conta pela geometria e chama de volta. As DECISÕES de seleção vivem em
 * domain/selection.ts — este organismo só reporta o índice.
 */
export function Necklace(props: NecklaceProps) {
  const {
    totalBeads,
    beadSec,
    segments,
    lockedEndBeads,
    phraseEndBeads,
    selection = null,
    window = null,
    windowMargin,
    sceneBand = true,
    playbackHead = null,
    transportOnly = false,
    size = SIZE_M,
    maxHeight,
    dragHandles,
  } = props;

  const windowRef = useRef<HTMLDivElement>(null);
  /** Última conta que a janela seguiu — ver a guarda no efeito do playhead. */
  const lastFollowedHead = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // afordâncias de seleção somem no modo transporte
  const effectiveSelection = transportOnly ? null : selection;

  const field = useMemo(
    () =>
      computeField(
        totalBeads,
        beadSec,
        width,
        size,
        segments ?? [],
        lockedEndBeads ?? [],
        phraseEndBeads ?? [],
        effectiveSelection,
        window,
        windowMargin,
        sceneBand,
      ),
    [
      totalBeads,
      beadSec,
      width,
      size,
      segments,
      lockedEndBeads,
      phraseEndBeads,
      effectiveSelection,
      window,
      windowMargin,
      sceneBand,
    ],
  );

  const { winS, winE } = resolveWindow(totalBeads, beadSec, window, windowMargin);
  const bpr = beadsPerRow(width, size);

  // ref-mirror: os listeners nativos (montados uma vez) leem sempre o estado atual.
  // A escrita em ref fica num efeito (a regra react-hooks/refs proíbe mutar no render).
  const ixRef = useRef<Interaction>(null as unknown as Interaction);
  useLayoutEffect(() => {
    ixRef.current = {
      total: totalBeads,
      size,
      width,
      winS,
      winE,
      bpr,
      selection: effectiveSelection,
      transportOnly,
      playbackHead,
      dragHandles: dragHandles ?? [],
      onBeadPointerDown: props.onBeadPointerDown,
      onEdgeHover: props.onEdgeHover,
      onHeadTap: props.onHeadTap,
      onDragBoundary: props.onDragBoundary,
    };
  });

  // medida da largura (síncrona) + observador de resize
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    // ResizeObserver não existe no jsdom; a medida síncrona basta lá.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // handlers delegados nativos — montados UMA vez; leem ixRef.current
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    // As contas são posicionadas contra a caixa de PADDING do container, com a
    // largura medida em `ix.width` (clientWidth). O hit-test tem de ler as duas
    // mesmas fontes: uma borda (ou barra de rolagem) separa clientWidth de
    // getBoundingClientRect().width e afasta a origem de `rect.left` — e aí tocar
    // numa conta tocaria a vizinha.
    function beadFromEvent(ev: PointerEvent): number {
      const ix = ixRef.current;
      const rect = node!.getBoundingClientRect();
      const xOff = centerOffset(
        ix.winS <= ix.winE ? ix.winE - ix.winS + 1 : 0,
        ix.bpr,
        ix.width,
        ix.size,
      );
      return beadAtXY(
        ev.clientX - rect.left - node!.clientLeft - xOff,
        ev.clientY - rect.top - node!.clientTop,
        ix.winS,
        ix.winE,
        ix.bpr,
        ix.size,
      );
    }

    // punho na conta EXATA da fronteira (sem tolerância: ±1 engoliria contas
    // internas de frases curtas, roubando o toque-para-ouvir delas)
    function handleAt(bead: number): string | null {
      return ixRef.current.dragHandles.find((h) => h.at === bead)?.id ?? null;
    }

    // Arrastar fronteira (ENG-342): pointerdown perto de um punho ARMA o drag mas
    // não o inicia — só vira arrasto ao mover ≥1 conta. Sem esse limiar, um TAP
    // numa conta de fim de cena (que é um punho) deixaria de tocar a cena
    // (ENG-347). Solto sem arrastar → o tap normal dispara no pointerup.
    let pending: { id: string; startBead: number } | null = null;
    let dragging: string | null = null;

    /**
     * Dwell da borda — porte fiel de L584-597 ("sugestão da Marcia"): parar ~280 ms
     * a ±1 conta de uma fronteira toca só ela. O clique NÃO o cancela, e o timer
     * armado sobrevive ao clique, porque na referência hover e clique concordam:
     * do segundo clique em diante o clique também toca só a borda (`playEdge`).
     * Uma supressão pós-clique existiu enquanto o clique OUVIA até o fim do pai
     * (regra 1, 2026-07); com o `cordInteraction` restaurado ela deixou de ter
     * objeto e saiu — divergir aqui seria divergir sem motivo.
     */
    let hoverEdge: number | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    const clearHover = () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = null;
      hoverEdge = null;
    };

    function onPointerDown(ev: PointerEvent): void {
      const ix = ixRef.current;
      if (!ix.total) return;
      const bead = beadFromEvent(ev);
      const handle = ix.onDragBoundary ? handleAt(bead) : null;
      if (handle !== null) {
        pending = { id: handle, startBead: bead };
        // boundary do DOM: um PointerEvent sintético (teste) não tem pointer
        // capturável e lança — o drag segue pelos listeners no próprio nó.
        try {
          node!.setPointerCapture(ev.pointerId);
        } catch {
          /* sem captura (evento sintético) */
        }
        ev.preventDefault();
        return;
      }
      if (ix.playbackHead !== null && bead === ix.playbackHead) ix.onHeadTap?.();
      else ix.onBeadPointerDown?.(bead);
      ev.preventDefault();
    }

    function endDrag(ev: PointerEvent): void {
      const ix = ixRef.current;
      /* `pointercancel` NÃO é um toque. O navegador cancela quando decide levar o
         gesto (rolagem, back-swipe) — tratá-lo como tap fazia a cena começar a
         tocar no meio de um arrasto que o dedo nem terminou. Só o `pointerup`
         sem arrasto é toque. */
      const foiToque = ev.type !== 'pointercancel';
      // fim do arrasto: um último aviso com `done`, para a página soar o resultado uma
      // vez só. `pointercancel` não avisa — o gesto não terminou, foi tomado.
      if (dragging !== null && foiToque) ix.onDragBoundary?.(dragging, beadFromEvent(ev), true);
      if (dragging === null && pending !== null && foiToque) {
        const bead = pending.startBead;
        if (ix.playbackHead !== null && bead === ix.playbackHead) ix.onHeadTap?.();
        else ix.onBeadPointerDown?.(bead);
      }
      if (pending !== null && node!.hasPointerCapture(ev.pointerId))
        node!.releasePointerCapture(ev.pointerId);
      pending = null;
      dragging = null;
    }

    function onPointerMove(ev: PointerEvent): void {
      const ix = ixRef.current;
      // arrasto de fronteira em curso (ou armado): domina o move
      if (pending !== null) {
        const bead = beadFromEvent(ev);
        if (dragging === null && Math.abs(bead - pending.startBead) >= 1) dragging = pending.id;
        if (dragging !== null) ix.onDragBoundary?.(dragging, bead);
        return;
      }
      if (ev.pointerType === 'touch') return; // hover só no mouse
      const sel = ix.selection;
      if (!ix.total || ix.transportOnly || !sel) return clearHover();
      const bead = beadFromEvent(ev);
      const near = (edge: number) => bead === edge || bead === edge - 1 || bead === edge + 1;
      const edge = near(sel.s) ? sel.s : near(sel.e) ? sel.e : null;
      if (edge === null) return clearHover();
      if (edge === hoverEdge) return; // já agendado/tocado nesta fronteira
      hoverEdge = edge;
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        // re-checa a seleção: se ela sumiu durante o dwell, não toca (referência L595)
        if (hoverEdge === edge && ixRef.current.selection) ixRef.current.onEdgeHover?.(edge);
      }, 280);
    }

    // sair do colar zera o dwell (L597)
    const onPointerLeave = () => clearHover();

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);
    node.addEventListener('pointerleave', onPointerLeave);
    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', endDrag);
      node.removeEventListener('pointercancel', endDrag);
      node.removeEventListener('pointerleave', onPointerLeave);
      if (hoverTimer) clearTimeout(hoverTimer);
    };
  }, []);

  // iluminação de playback — imperativa: escreve `data-play` nas contas ≤ head
  // sem re-renderizar os elementos (BeadField é memoizado sem playbackHead).
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const head = playbackHead;
    for (const bead of node.querySelectorAll<HTMLElement>('.cds-necklace-bead')) {
      const idx = Number(bead.dataset.idx);
      if (head === null || idx > head) delete bead.dataset.play;
      else bead.dataset.play = idx === head ? 'head' : 'played';
    }

    // ...e a janela segue essa mesma cabeça (ENG-387): sem isto, numa história
    // longa o ouvinte caça a conta acesa rolando o documento. Fica aqui, na ilha
    // imperativa, para não passar por estado do React a 60fps.
    //
    // Só quando a CABEÇA anda. O efeito também roda quando o campo se recompõe
    // (mudou a seleção, por exemplo), e a cabeça sobrevive à pausa: sem esta
    // guarda, pausar no fim da história, rolar de volta ao começo e tocar numa
    // conta para cortar arrastava a janela de volta para o ponto pausado — bem em
    // cima da conta que a pessoa acabou de escolher.
    const cabecaAndou = head !== lastFollowedHead.current;
    lastFollowedHead.current = head;

    const win = windowRef.current;
    if (!win || head === null || !cabecaAndou || head < winS || head > winE) return;
    const next = followScrollTop(
      beadPosition(head, winS, winE, bpr, size).top,
      size,
      win.clientHeight,
      win.scrollTop,
    );
    if (next === null) return;
    // lido na hora da chamada: uma media query de folha de estilo não alcança um
    // scroll imperativo (§4.5 — movimento decorativo é opt-in)
    const reduce =
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    win.scrollTo({ top: next, behavior: reduce ? 'auto' : 'smooth' });
  }, [playbackHead, field, winS, winE, bpr, size]);

  // punhos de arrasto (ENG-342): marca as contas-fronteira para o cursor. Escrita
  // imperativa como o playback — não recomputa o campo memoizado.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ats = new Set((dragHandles ?? []).map((h) => h.at));
    for (const bead of node.querySelectorAll<HTMLElement>('.cds-necklace-bead')) {
      if (ats.has(Number(bead.dataset.idx))) bead.dataset.dragHandle = 'true';
      else delete bead.dataset.dragHandle;
    }
  }, [dragHandles, field]);

  return (
    <div
      ref={windowRef}
      className="cds-necklace-window"
      style={maxHeight === undefined ? undefined : { maxHeight: `${maxHeight}px` }}
    >
      <div ref={containerRef} className="cds-necklace" style={{ height: `${field.height}px` }}>
        <BeadField field={field} size={size} />
      </div>
    </div>
  );
}
