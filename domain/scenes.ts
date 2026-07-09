/**
 * História inteira + corte sequencial de cenas — port 1:1 de confirmWhole
 * (docs/reference/index.html L685–694), reabrir história (L677–680), primePart
 * (L698–703), addPart (L705–711), confirmPart (L713–724), reopenPart
 * (L726–731), confirmParts (L757–767) e enterLayer('parts') (L930–935).
 * PRD v2 §8.3–§8.4, §11.
 *
 * Erros de validação são códigos tipados com a cópia PT-BR contratual como
 * constante (a UI reusa a mensagem; o significado é contrato). Sem throw no
 * fluxo — Result discriminado.
 */

import { activeAnchor, frontier } from './frontier';
import { nextPartId } from './ids';
import type { ScenePart, SessionState } from './state';

export type SceneErrorCode =
  | 'WHOLE_SPAN_INCOMPLETE'
  | 'SELECTION_INCOMPLETE'
  | 'SCENE_BEFORE_FRONTIER'
  | 'WHOLE_NOT_CONFIRMED'
  | 'NO_LOCKED_SCENE';

/** Cópia contratual PT-BR (referência L688, L716, L718, L759, L761). */
export const SCENE_ERROR_COPY = {
  WHOLE_SPAN_INCOMPLETE: (lastBead: number) =>
    `O áudio precisa cobrir a história inteira — da conta 0 à conta ${lastBead}.`,
  SELECTION_INCOMPLETE: 'Clique onde a cena termina, no colar.',
  SCENE_BEFORE_FRONTIER: (frontierBead: number) =>
    `A cena não pode começar antes da conta ${frontierBead}.`,
  WHOLE_NOT_CONFIRMED: 'Ouça a história completa primeiro.',
  NO_LOCKED_SCENE: 'Confirme ao menos uma cena.',
} as const;

export interface SceneError {
  code: SceneErrorCode;
  message: string;
}

export type SceneResult = { ok: true; state: SessionState } | { ok: false; error: SceneError };

function err(error: SceneError): SceneResult {
  return { ok: false, error };
}

export function confirmWhole(state: SessionState): SceneResult {
  const sp = state.whole.span;
  if (sp.s !== 0 || sp.e !== state.totalBeads - 1) {
    return err({
      code: 'WHOLE_SPAN_INCOMPLETE',
      message: SCENE_ERROR_COPY.WHOLE_SPAN_INCOMPLETE(state.totalBeads - 1),
    });
  }
  const confirmed = { ...state, whole: { ...state.whole, confirmed: true } };
  // a referência segue por setMode("escuta") → enterLayer("parts") (L692, L1013)
  return { ok: true, state: enterPartsLayer(confirmed) };
}

/** Reabrir a história (handler do Reabrir, L677–680): a referência NÃO limpa
 *  selection/pendingStart aqui — quirk espelhado de propósito. */
export function reopenWhole(state: SessionState): SessionState {
  return {
    ...state,
    whole: { ...state.whole, confirmed: false },
    partsConfirmed: false,
    current: { layer: 'whole', index: -1 },
  };
}

export function addPart(state: SessionState): SessionState {
  if (activeAnchor(state)) return state;
  const novo: ScenePart = {
    part_id: nextPartId(state.parts),
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
  };
  const parts = [...state.parts, novo];
  return primePart({ ...state, parts, current: { layer: 'parts', index: parts.length - 1 } });
}

/** Pré-ancora o início da cena corrente na emenda (fim da anterior + 1). */
export function primePart(state: SessionState): SessionState {
  if (state.current.layer !== 'parts' || state.current.index < 0) return state;
  const pt = state.parts[state.current.index];
  if (!pt || pt.locked) return state;
  const f = frontier(state, 'parts');
  return { ...state, pendingStart: f, selection: { s: f, e: f } };
}

export function confirmPart(state: SessionState, i: number): SceneResult {
  const pt = state.parts[i];
  if (!pt || pt.locked) return { ok: true, state }; // no-op silencioso (L715)
  if (!state.selection || state.pendingStart !== null) {
    return err({ code: 'SELECTION_INCOMPLETE', message: SCENE_ERROR_COPY.SELECTION_INCOMPLETE });
  }
  const fl = frontier(state, 'parts');
  if (state.selection.s < fl) {
    return err({
      code: 'SCENE_BEFORE_FRONTIER',
      message: SCENE_ERROR_COPY.SCENE_BEFORE_FRONTIER(fl),
    });
  }
  const travada: ScenePart = {
    ...pt,
    span: { s: state.selection.s, e: state.selection.e },
    locked: true,
  };
  const parts = state.parts.map((p, k) => (k === i ? travada : p));
  const base = { ...state, parts, selection: null, pendingStart: null };
  // completou o bloco: vai para o próximo destravado, já primado — ou auto-add
  const next = parts.findIndex((p) => !p.locked);
  if (next >= 0) {
    return { ok: true, state: primePart({ ...base, current: { layer: 'parts', index: next } }) };
  }
  return { ok: true, state: addPart({ ...base, current: { layer: 'parts', index: -1 } }) };
}

export function reopenPart(state: SessionState, i: number): SessionState {
  const alvo = state.parts[i];
  // desvio DELIBERADO: a referência quebraria com TypeError em índice inválido
  // (L729); aqui é no-op — a UI nunca chama fora do intervalo
  if (!alvo) return state;
  const parts = state.parts.map((p, k) => (k >= i ? { ...p, locked: false } : p));
  return {
    ...state,
    parts,
    current: { layer: 'parts', index: i },
    selection: alvo.span ? { s: alvo.span.s, e: alvo.span.e } : null,
    pendingStart: null,
  };
}

export function confirmParts(state: SessionState): SceneResult {
  if (!state.whole.confirmed) {
    return err({ code: 'WHOLE_NOT_CONFIRMED', message: SCENE_ERROR_COPY.WHOLE_NOT_CONFIRMED });
  }
  const travadas = state.parts.filter((p) => p.locked && p.span);
  if (travadas.length === 0) {
    return err({ code: 'NO_LOCKED_SCENE', message: SCENE_ERROR_COPY.NO_LOCKED_SCENE });
  }
  // descarta qualquer cena aberta/vazia que sobrou no fim (o PT# volta ao pool)
  return {
    ok: true,
    state: {
      ...state,
      parts: travadas,
      current: { layer: 'parts', index: -1 },
      selection: null,
      pendingStart: null,
      partsConfirmed: true,
      // setMode("triagem") (L766): transição direta; gates de modo são ENG-219
      mode: 'triagem',
    },
  };
}

/** Port de enterLayer("parts") (L930–935): assume o ÚLTIMO slot destravado
 *  (quirk do laço da referência), senão entra vazio ou auto-adiciona. */
function enterPartsLayer(state: SessionState): SessionState {
  let lu = -1;
  state.parts.forEach((p, k) => {
    if (!p.locked) lu = k;
  });
  const limpo = { ...state, selection: null, pendingStart: null };
  if (lu >= 0) return primePart({ ...limpo, current: { layer: 'parts', index: lu } });
  if (state.partsConfirmed) return { ...limpo, current: { layer: 'parts', index: -1 } };
  return addPart({ ...limpo, current: { layer: 'parts', index: -1 } });
}
