/**
 * Camada 3 — as frases. Port 1:1 de sceneIndexOf (docs/reference/index.html
 * L396; activeScene L395 vive em seam.ts, o ramo de fronteira com back-reach
 * L400–410 em frontier.ts — ENG-269), addFrase
 * (L772–777), confirmFrase (L779–792), lockFrase (L793–798), doMove (L814),
 * removeFrase (L850–855), enterScene (L837–842), enterLayer("frases")
 * (L930–935), do bloco de entrada em segmentação do setMode (L1003–1008) e
 * confirmFrasesDone (L916–929). O reabrir/⚑ (reference L843–848, L883) foi
 * removido na ENG-342 — ajuste pós-fato agora é arrastar fronteira
 * (dragPhraseBoundary). PRD v2 §6.4, §8.6, §11.
 *
 * Quirks espelhados de propósito: confirmFrase NÃO checa pendingStart (meia-
 * seleção {b,b} passa); a fronteira com cena ativa NÃO clampa em totalBeads−1;
 * slots dangling ocupam seu P#; lockFrase pula para o PRIMEIRO destravado,
 * removeFrase/enterLayer assumem o ÚLTIMO.
 *
 * `warnedEmptyScene` é variável de módulo na referência (L916) — aqui vira
 * parâmetro/retorno explícito de confirmFrasesDone (estado efêmero de UI; não
 * entra na sessão).
 */

import { activeAnchor, frontier } from './frontier';
import { setMode } from './gates';
import { nextPid } from './ids';
import { activeScene, classifyBorderMove, slideSeam, type BorderOffer } from './seam';
import { productiveScenes } from './triagem';
import type { Frase, SessionState, Span } from './state';

// activeScene mudou para seam.ts (ENG-269, quebra de ciclo com frontier.ts);
// re-exportado aqui para manter a API pública do domain estável.
export { activeScene } from './seam';

/** Índice da cena na vista de produtivas, ou −1 (L396). */
export function sceneIndexOf(state: SessionState, id: string | null): number {
  return productiveScenes(state).findIndex((p) => p.part_id === id);
}

/**
 * Fronteira da camada de frases (L400–410): dentro da cena ativa, o fim da
 * última frase travada + 1; 1ª frase recua ao INÍCIO da vizinha anterior
 * (back-reach) ou ao início da própria cena. Sem cena ativa, o ramo genérico.
 * Desde a ENG-269 o ramo completo vive em frontier() — isto é um alias.
 */
export function phraseFrontier(state: SessionState): number {
  return frontier(state, 'frases');
}

/** Novo slot com o menor P# livre; no-op com âncora ativa (L772–777). */
export function addFrase(state: SessionState): SessionState {
  if (activeAnchor(state)) return state;
  const nova: Frase = {
    prop_id: nextPid(state.frases),
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
  };
  const frases = [...state.frases, nova];
  return {
    ...state,
    frases,
    current: { layer: 'frases', index: frases.length - 1 },
    selection: null,
    pendingStart: null,
  };
}

export type FraseErrorCode =
  | 'PARTS_NOT_CONFIRMED'
  | 'SELECTION_INCOMPLETE'
  | 'NO_PRODUCTIVE_SCENE'
  | 'FRASE_BEFORE_FRONTIER'
  | 'FRASE_BEYOND_STORY';

/** Cópia contratual PT-BR (referência L782–788). */
export const FRASE_ERROR_COPY = {
  PARTS_NOT_CONFIRMED: 'Confirme as cenas primeiro.',
  SELECTION_INCOMPLETE: 'Clique o início e o fim da frase no colar.',
  NO_PRODUCTIVE_SCENE: 'Nenhuma cena produtiva para frasear.',
  FRASE_BEFORE_FRONTIER: (frontierBead: number) =>
    `A frase não pode começar antes da conta ${frontierBead}.`,
  FRASE_BEYOND_STORY: 'A frase precisa terminar dentro do colar.',
} as const;

export interface FraseError {
  code: FraseErrorCode;
  message: string;
}

export type ConfirmFraseResult =
  | { kind: 'locked'; state: SessionState }
  | { kind: 'border'; offer: BorderOffer }
  | { kind: 'noop'; state: SessionState }
  | { kind: 'error'; error: FraseError };

function err(error: FraseError): ConfirmFraseResult {
  return { kind: 'error', error };
}

/** Guardas na ordem exata da referência (L779–792). */
export function confirmFrase(state: SessionState, i: number): ConfirmFraseResult {
  const fr = state.frases[i];
  if (!fr || fr.locked) return { kind: 'noop', state };
  if (!state.partsConfirmed) {
    return err({ code: 'PARTS_NOT_CONFIRMED', message: FRASE_ERROR_COPY.PARTS_NOT_CONFIRMED });
  }
  if (!state.selection) {
    return err({ code: 'SELECTION_INCOMPLETE', message: FRASE_ERROR_COPY.SELECTION_INCOMPLETE });
  }
  const sc = activeScene(state);
  const scSpan = sc?.span;
  if (!sc || !scSpan) {
    return err({ code: 'NO_PRODUCTIVE_SCENE', message: FRASE_ERROR_COPY.NO_PRODUCTIVE_SCENE });
  }
  const sel = { s: state.selection.s, e: state.selection.e };
  const fl = phraseFrontier(state);
  if (sel.s < fl) {
    return err({
      code: 'FRASE_BEFORE_FRONTIER',
      message: FRASE_ERROR_COPY.FRASE_BEFORE_FRONTIER(fl),
    });
  }
  if (sel.e > state.whole.span.e) {
    return err({ code: 'FRASE_BEYOND_STORY', message: FRASE_ERROR_COPY.FRASE_BEYOND_STORY });
  }
  const crossStart = sel.s < scSpan.s;
  const crossEnd = sel.e > scSpan.e;
  if (crossStart || crossEnd) {
    return { kind: 'border', offer: classifyBorderMove(state, sc, sel, i) };
  }
  return { kind: 'locked', state: lockFrase(state, i, sel, sc.part_id) };
}

/** Trava a frase na cena ATIVA e pula ao 1º destravado ou auto-add (L793–798). */
function lockFrase(state: SessionState, i: number, sel: Span, sceneId: string): SessionState {
  const frases = state.frases.map((f, k) =>
    k === i ? { ...f, span: { s: sel.s, e: sel.e }, locked: true, part_link: sceneId } : f,
  );
  const base = { ...state, frases, selection: null, pendingStart: null };
  const next = frases.findIndex((f) => !f.locked);
  if (next >= 0) return { ...base, current: { layer: 'frases' as const, index: next } };
  return addFrase({ ...base, current: { layer: 'frases', index: -1 } });
}

/** doMove (L814): desliza a costura e trava a frase na cena ativa.
 *  Pré-condição: chamar com o MESMO estado (mesma cena ativa) que produziu a
 *  oferta — a referência fecha sobre a cena no momento da oferta e descarta a
 *  oferta em todo caminho que troca o foco de cena. */
export function moveBorder(state: SessionState, offer: BorderOffer): SessionState {
  const sc = activeScene(state);
  if (!sc) return state;
  const slid = slideSeam(
    state,
    sc.part_id,
    offer.crossStart ? offer.sel.s : null,
    offer.crossEnd ? offer.sel.e : null,
  );
  return lockFrase(slid, offer.fraseIndex, offer.sel, sc.part_id);
}

/** "Reancorar dentro da cena" (L812): descarta a seleção e recomeça. */
export function reanchorFrase(state: SessionState): SessionState {
  return { ...state, selection: null, pendingStart: null };
}

/** Remove e libera o P#; assume o ÚLTIMO destravado ou auto-add (L850–855).
 *  Desvio deliberado: índice fora do intervalo não remove nada (o splice(-1)
 *  da referência removeria a última — inalcançável por chamador bem-formado). */
export function removeFrase(state: SessionState, i: number): SessionState {
  const frases = state.frases.filter((_, k) => k !== i);
  const base = { ...state, frases, selection: null, pendingStart: null };
  let lu = -1;
  frases.forEach((f, k) => {
    if (!f.locked) lu = k;
  });
  if (lu >= 0) return { ...base, current: { layer: 'frases' as const, index: lu } };
  return addFrase({ ...base, current: { layer: 'frases', index: -1 } });
}

/**
 * Arrastar uma borda ('start'/'end') de uma frase travada (ENG-342). Cresce/
 * encolhe a frase dentro da SUA cena; cobertura esparsa é legal, então em vão a
 * borda só cresce e a vizinha imediata só encolhe quando de fato se tocam —
 * Pac-Man, sem ripple. Clampa dentro da cena e mantém ambas com ≥1 conta.
 * Sem mudança → no-op (identidade). Vizinhas são só frases travadas da MESMA cena.
 */
export function dragPhraseBoundary(
  state: SessionState,
  fraseIndex: number,
  edge: 'start' | 'end',
  toBead: number,
): SessionState {
  const f = state.frases[fraseIndex];
  if (!f || !f.locked || !f.span || f.part_link === null) return state;
  const scene = state.parts.find((p) => p.part_id === f.part_link);
  if (!scene || !scene.span) return state;
  const fSpan = f.span;
  type Nb = { s: number; e: number; k: number };
  const sameScene = (fr: Frase, k: number): fr is Frase & { span: Span } =>
    k !== fraseIndex && fr.locked && fr.span !== null && fr.part_link === f.part_link;

  if (edge === 'end') {
    // vizinha à direita: a frase travada da cena com o MENOR início depois desta
    const neighbor = state.frases.reduce<Nb | null>((acc, fr, k) => {
      if (!sameScene(fr, k) || fr.span.s <= fSpan.s) return acc;
      return !acc || fr.span.s < acc.s ? { s: fr.span.s, e: fr.span.e, k } : acc;
    }, null);
    const hardHi = neighbor ? neighbor.e - 1 : scene.span.e;
    const newE = Math.max(fSpan.s, Math.min(hardHi, toBead));
    const touches = neighbor !== null && newE >= neighbor.s;
    if (newE === fSpan.e && !touches) return state;
    const frases = state.frases.map((fr, k) => {
      if (k === fraseIndex) return { ...fr, span: { s: fSpan.s, e: newE } };
      if (neighbor && touches && k === neighbor.k)
        return { ...fr, span: { s: newE + 1, e: neighbor.e } };
      return fr;
    });
    return { ...state, frases };
  }

  // vizinha à esquerda: a frase travada da cena com o MAIOR fim antes desta
  const neighbor = state.frases.reduce<Nb | null>((acc, fr, k) => {
    if (!sameScene(fr, k) || fr.span.e >= fSpan.e) return acc;
    return !acc || fr.span.e > acc.e ? { s: fr.span.s, e: fr.span.e, k } : acc;
  }, null);
  const hardLo = neighbor ? neighbor.s + 1 : scene.span.s;
  const newS = Math.min(fSpan.e, Math.max(hardLo, toBead));
  const touches = neighbor !== null && newS <= neighbor.e;
  if (newS === fSpan.s && !touches) return state;
  const frases = state.frases.map((fr, k) => {
    if (k === fraseIndex) return { ...fr, span: { s: newS, e: fSpan.e } };
    if (neighbor && touches && k === neighbor.k)
      return { ...fr, span: { s: neighbor.s, e: newS - 1 } };
    return fr;
  });
  return { ...state, frases };
}

/** Foca uma cena produtiva: 1º slot destravado ou auto-add dangling (L837–842). */
export function enterScene(state: SessionState, sceneId: string): SessionState {
  const base = { ...state, activeSceneId: sceneId, selection: null, pendingStart: null };
  const lu = base.frases.findIndex((f) => !f.locked);
  if (lu >= 0) return { ...base, current: { layer: 'frases' as const, index: lu } };
  return addFrase({ ...base, current: { layer: 'frases', index: -1 } });
}

/** enterLayer("frases") (L930–935): assume o ÚLTIMO destravado ou auto-add. */
export function enterFrasesLayer(state: SessionState): SessionState {
  let lu = -1;
  state.frases.forEach((f, k) => {
    if (!f.locked) lu = k;
  });
  const limpo = { ...state, selection: null, pendingStart: null };
  if (lu >= 0) return { ...limpo, current: { layer: 'frases' as const, index: lu } };
  return addFrase({ ...limpo, current: { layer: 'frases', index: -1 } });
}

/** Bloco de entrada em segmentação do setMode (L1006–1008): conserta um
 *  activeSceneId inválido para a 1ª produtiva e entra na cena; sem produtivas,
 *  entra na camada. Compor APÓS gates.setMode(state, 'segmentacao') e SÓ
 *  quando o modo efetivo for segmentacao — sob redirect (zero produtivas) a
 *  referência não roda este bloco, e compô-lo criaria um slot P# dangling. */
export function enterSegmentacao(state: SessionState): SessionState {
  const first = productiveScenes(state)[0];
  if (first) {
    const valid = state.activeSceneId !== null && sceneIndexOf(state, state.activeSceneId) >= 0;
    return enterScene(
      state,
      valid && state.activeSceneId !== null ? state.activeSceneId : first.part_id,
    );
  }
  return enterFrasesLayer(state);
}

/** Aviso leve de cena vazia — copy contratual (referência L922). */
export const FRASES_EMPTY_WARNING =
  'Esta cena ficou sem frases. Clique de novo para seguir mesmo assim.';

export type FrasesDoneResult =
  | { kind: 'noop'; state: SessionState; warnedEmptyScene: string | null }
  | { kind: 'warn-empty'; state: SessionState; warnedEmptyScene: string; message: string }
  | { kind: 'next-scene'; state: SessionState; warnedEmptyScene: null }
  | { kind: 'mapeamento'; state: SessionState; warnedEmptyScene: string | null };

/**
 * confirmFrasesDone (L917–929): cena vazia avisa uma vez POR CENA (o marcador
 * entra e sai como dado); a segunda chamada segue mesmo assim. Última produtiva
 * (ou nenhuma) pede mapeamento — o redirect do gates decide o modo efetivo.
 * No ramo sem cena ativa a referência NÃO toca o marcador (L917–918) —
 * preservado; o reset a null só acontece após passar o check de aviso (L925).
 */
export function confirmFrasesDone(
  state: SessionState,
  warnedEmptyScene: string | null,
): FrasesDoneResult {
  if (state.review) return { kind: 'noop', state, warnedEmptyScene };
  const sc = activeScene(state);
  if (!sc) {
    return { kind: 'mapeamento', state: setMode(state, 'mapeamento'), warnedEmptyScene };
  }
  const n = state.frases.filter((f) => f.locked && f.span && f.part_link === sc.part_id).length;
  if (n === 0 && warnedEmptyScene !== sc.part_id) {
    return {
      kind: 'warn-empty',
      state,
      warnedEmptyScene: sc.part_id,
      message: FRASES_EMPTY_WARNING,
    };
  }
  const ps = productiveScenes(state);
  const idx = sceneIndexOf(state, sc.part_id);
  const next = idx >= 0 && idx < ps.length - 1 ? ps[idx + 1] : undefined;
  if (next) {
    return { kind: 'next-scene', state: enterScene(state, next.part_id), warnedEmptyScene: null };
  }
  return { kind: 'mapeamento', state: setMode(state, 'mapeamento'), warnedEmptyScene: null };
}
