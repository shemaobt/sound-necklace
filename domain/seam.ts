/**
 * Costura entre cenas e travessia de borda — port 1:1 de activeScene (docs/
 * reference/index.html L395), prevNeighbor/nextNeighbor (L397–398), sceneHasFrases (L399),
 * offerBorderMove (L801–830 — aqui a DECISÃO vira dado puro, effects-as-data;
 * a UI interpreta a oferta), slideSeam (L832–835) e da janela da segmentação
 * (renderCord L509). PRD v2 §8.6, §11.
 *
 * O limiar de re-corte é `max(3, Math.round(0.25·span))` — 0.25 é potência de
 * dois, o produto é exato em IEEE-754 e o empate (span % 4 === 2) arredonda
 * para +∞ por spec: determinístico entre engines.
 */

import { skShort } from './scene-kinds';
import { productiveScenes } from './triagem';
import type { ScenePart, SessionState, Span } from './state';

/** A cena produtiva em foco: resolve por activeSceneId, senão a 1ª (L395).
 *  Vive aqui (não em phrases.ts) para frontier.ts poder importá-la sem ciclo. */
export function activeScene(state: SessionState): ScenePart | null {
  const ps = productiveScenes(state);
  let a: ScenePart | null = null;
  for (const p of ps) if (p.part_id === state.activeSceneId) a = p;
  return a ?? ps[0] ?? null;
}

/** Cena travada com span provado no tipo (pós-narrowing). */
export type AnchoredPart = ScenePart & { span: Span };

function anchored(p: ScenePart): p is AnchoredPart {
  return p.locked && p.span !== null;
}

/** Vizinha travada imediatamente ANTES da cena (none_fit conta — L397). */
export function prevNeighbor(state: SessionState, sc: ScenePart): AnchoredPart | null {
  const scSpan = sc.span;
  if (!scSpan) return null;
  let best: AnchoredPart | null = null;
  for (const p of state.parts) {
    if (anchored(p) && p.part_id !== sc.part_id && p.span.e < scSpan.s) {
      if (!best || p.span.e > best.span.e) best = p;
    }
  }
  return best;
}

/** Vizinha travada imediatamente DEPOIS da cena (L398). */
export function nextNeighbor(state: SessionState, sc: ScenePart): AnchoredPart | null {
  const scSpan = sc.span;
  if (!scSpan) return null;
  let best: AnchoredPart | null = null;
  for (const p of state.parts) {
    if (anchored(p) && p.part_id !== sc.part_id && p.span.s > scSpan.e) {
      if (!best || p.span.s < best.span.s) best = p;
    }
  }
  return best;
}

/** A cena tem ≥1 frase travada com span ligada a ela? (L399) */
export function sceneHasFrases(state: SessionState, sc: ScenePart | null): boolean {
  return (
    !!sc && state.frases.some((fr) => fr.locked && fr.span !== null && fr.part_link === sc.part_id)
  );
}

export type BorderOfferKind = 'two-productive' | 'escalation' | 'simple';

/** Cópia contratual da oferta de borda (referência L810–826). */
export const BORDER_COPY = {
  QUESTION: (dir: string, kindLabel: string) =>
    `Esta frase passa ${dir} da cena (${kindLabel}). O tipo continua aqui?`,
  TWO_PRODUCTIVE:
    '⚑ A cena vizinha é produtiva e já tem frases — mover a borda mexe em duas cenas. Trate na Triagem, não aqui.',
  ESCALATION: (why: string) =>
    `⚑ Ajuste grande (${why}) — parece re-corte de cena, não borda. O certo é re-olhar na Triagem.`,
  WHY_CONSUMED: 'engole a cena vizinha inteira',
  WHY_DELTA: (delta: number, thr: number) => `são ${delta} contas, acima do limiar de ${thr}`,
  MOVE: 'Mover a borda até aqui',
  MOVE_ANYWAY: 'Mover mesmo assim',
  BACK_TO_TRIAGEM: 'Voltar à Triagem',
  REANCHOR: 'Reancorar dentro da cena',
  MOVED: '✓ Borda movida; a costura deslizou.',
} as const;

/** A oferta como dado: a UI monta os botões a partir dela (doMove/reanchor/
 *  triagem); `sel` é o snapshot da seleção no momento do confirm. */
export interface BorderOffer {
  fraseIndex: number;
  sel: Span;
  crossStart: boolean;
  crossEnd: boolean;
  delta: number;
  thr: number;
  consumed: boolean;
  kind: BorderOfferKind;
  /** true na oferta simples e na escalada não-consumida ("Mover mesmo assim"). */
  canMove: boolean;
  question: string;
  warning: string | null;
}

/**
 * Classificação pura da travessia (offerBorderMove L801–830). Chamada só com a
 * cena ativa produtiva — span/tipo ausentes são violação de invariante do
 * chamador, não fluxo: lança e deixa subir.
 */
export function classifyBorderMove(
  state: SessionState,
  sc: ScenePart,
  sel: Span,
  fraseIndex: number,
): BorderOffer {
  const scSpan = sc.span;
  if (!scSpan || sc.scene_kind === null) {
    throw new Error('classifyBorderMove: cena ativa sem span/tipo');
  }
  const crossStart = sel.s < scSpan.s;
  const crossEnd = sel.e > scSpan.e;
  // quando cruza dos dois lados, o fim decide vizinha/delta (quirk L802–803)
  const nb = crossEnd ? nextNeighbor(state, sc) : prevNeighbor(state, sc);
  const delta = crossEnd ? sel.e - scSpan.e : scSpan.s - sel.s;
  const sceneSpan = scSpan.e - scSpan.s + 1;
  const thr = Math.max(3, Math.round(0.25 * sceneSpan));
  const consumed = nb ? (crossEnd ? sel.e >= nb.span.e : sel.s <= nb.span.s) : false;
  const twoProd =
    nb !== null && nb.tag_state === 'tagged' && nb.scene_kind !== null && sceneHasFrases(state, nb);
  const dir = crossEnd ? 'o fim' : 'o começo';
  const base = {
    fraseIndex,
    sel,
    crossStart,
    crossEnd,
    delta,
    thr,
    consumed,
    question: BORDER_COPY.QUESTION(dir, skShort(sc.scene_kind)),
  };

  if (twoProd) {
    return {
      ...base,
      kind: 'two-productive',
      canMove: false,
      warning: BORDER_COPY.TWO_PRODUCTIVE,
    };
  }
  if (consumed || delta > thr) {
    const why = consumed ? BORDER_COPY.WHY_CONSUMED : BORDER_COPY.WHY_DELTA(delta, thr);
    return {
      ...base,
      kind: 'escalation',
      canMove: !consumed,
      warning: BORDER_COPY.ESCALATION(why),
    };
  }
  return { ...base, kind: 'simple', canMove: true, warning: null };
}

function withSpan(parts: ScenePart[], id: string, span: Span): ScenePart[] {
  return parts.map((p) => (p.part_id === id ? { ...p, span } : p));
}

/**
 * Desliza a costura compartilhada: a cena cresce, a vizinha imediata travada
 * encolhe — nas duas direções (L832–835). A referência recomputa prevNeighbor
 * após o ramo do fim, mas esse ramo só move `nb.span.s` (uma cena POSTERIOR) e
 * `sc.span.e` — nenhum dos dois participa da comparação `p.span.e < sc.span.s`
 * do ramo do começo, então calcular as duas vizinhas sobre o estado original é
 * comportamento-idêntico.
 */
export function slideSeam(
  state: SessionState,
  sceneId: string,
  newStart: number | null,
  newEnd: number | null,
): SessionState {
  const sc = state.parts.find((p) => p.part_id === sceneId);
  const scSpan = sc?.span;
  if (!sc || !scSpan) return state;
  let parts = state.parts;
  let span = scSpan;
  if (newEnd !== null && newEnd > span.e) {
    const nb = nextNeighbor(state, sc);
    if (nb && nb.span.s <= newEnd)
      parts = withSpan(parts, nb.part_id, { s: newEnd + 1, e: nb.span.e });
    span = { s: span.s, e: newEnd };
    parts = withSpan(parts, sceneId, span);
  }
  if (newStart !== null && newStart < span.s) {
    const pb = prevNeighbor(state, sc);
    if (pb && pb.span.e >= newStart)
      parts = withSpan(parts, pb.part_id, { s: pb.span.s, e: newStart - 1 });
    span = { s: newStart, e: span.e };
    parts = withSpan(parts, sceneId, span);
  }
  if (parts === state.parts) return state;
  return { ...state, parts };
}

/**
 * Arrastar a fronteira INTERNA entre `leftPartId` e a vizinha travada seguinte
 * (ENG-342): a fronteira passa a terminar a cena esquerda em `newEnd`, e a
 * direita começa em `newEnd+1` — Pac-Man, só a vizinha imediata muda de tamanho.
 * Clampa em `[left.span.s, right.span.e-1]` (nenhuma das duas fica vazia). É só
 * um caso dirigido por gesto do `slideSeam` já existente: crescer para a direita
 * estica a esquerda; para a esquerda, estica a direita. Sem vizinha à frente
 * (última cena) ou sem mudança → no-op (identidade).
 */
export function dragSceneBoundary(
  state: SessionState,
  leftPartId: string,
  newEnd: number,
): SessionState {
  const left = state.parts.find((p) => p.part_id === leftPartId);
  if (!left || !left.locked || !left.span) return state;
  const right = nextNeighbor(state, left);
  if (!right) return state;
  const clamped = Math.max(left.span.s, Math.min(right.span.e - 1, newEnd));
  if (clamped === left.span.e) return state;
  return clamped > left.span.e
    ? slideSeam(state, leftPartId, null, clamped)
    : slideSeam(state, right.part_id, clamped + 1, null);
}

/** Margem da janela da segmentação: max(3, round(2/beadSec)) (L509). */
export function windowMargin(beadSec: number): number {
  return Math.max(3, Math.round(2 / beadSec));
}

/** Janela de render = cena ativa ± margem, clampada ao colar (L509). */
export function sceneWindow(span: Span, beadSec: number, totalBeads: number): Span {
  const m = windowMargin(beadSec);
  return { s: Math.max(0, span.s - m), e: Math.min(totalBeads - 1, span.e + m) };
}
