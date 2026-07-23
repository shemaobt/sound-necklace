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

/**
 * Pré-ancora o início da frase corrente no começo natural DENTRO da cena — início
 * da cena (1ª frase) ou fim da última travada + 1 — espelhando `primePart` das
 * cenas: a tela do ouvinte toca só o FIM (§8.6/§11, protótipo "toque onde cada
 * frase termina"). Clampa o back-reach da fronteira ao início da cena (a 1ª frase
 * ladrilha a partir da cena; recuar à vizinha é gesto que o um-toque não faz).
 * Sem cena ativa (contexto sem foco), no-op.
 */
export function primeFrase(state: SessionState): SessionState {
  if (state.current.layer !== 'frases' || state.current.index < 0) return state;
  const fr = state.frases[state.current.index];
  if (!fr || fr.locked) return state;
  const sc = activeScene(state);
  if (!sc || !sc.span) return state;
  const f = Math.max(sc.span.s, phraseFrontier(state));
  return { ...state, pendingStart: f, selection: { s: f, e: f } };
}

/** Novo slot com o menor P# livre; no-op com âncora ativa (L772–777). */
export function addFrase(state: SessionState): SessionState {
  if (activeAnchor(state)) return state;
  const nova: Frase = {
    prop_id: nextPid(state.frases),
    statement: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
  };
  const frases = [...state.frases, nova];
  return primeFrase({
    ...state,
    frases,
    current: { layer: 'frases', index: frases.length - 1 },
    selection: null,
    pendingStart: null,
  });
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
  SELECTION_INCOMPLETE: 'Clique onde a frase termina, no colar.',
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
  if (next >= 0) return primeFrase({ ...base, current: { layer: 'frases' as const, index: next } });
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

/** "Reancorar dentro da cena" (L812): descarta a seleção e re-ancora na fronteira. */
export function reanchorFrase(state: SessionState): SessionState {
  return primeFrase({ ...state, selection: null, pendingStart: null });
}

/** Remove e libera o P#; assume o ÚLTIMO destravado ou auto-add (L850–855).
 *  Port 1:1 do reference (fiel — o golden depende disto): a próxima frase NÃO
 *  absorve o espaço aqui; a absorção pós-remoção é um passo composto na UI
 *  (`absorbNextFrase`, #3), fora do escopo byte-idêntico do golden.
 *  Desvio preservado: índice fora do intervalo não remove nada. */
export function removeFrase(state: SessionState, i: number): SessionState {
  const frases = state.frases.filter((_, k) => k !== i);
  const base = { ...state, frases, selection: null, pendingStart: null };
  let lu = -1;
  frases.forEach((f, k) => {
    if (!f.locked) lu = k;
  });
  if (lu >= 0) return primeFrase({ ...base, current: { layer: 'frases' as const, index: lu } });
  return addFrase({ ...base, current: { layer: 'frases', index: -1 } });
}

/**
 * Absorção pós-remoção (#3, decisão do dono; composto na UI após `removeFrase`,
 * como o reprime pós-drag): a frase SEGUINTE da MESMA cena (a travada de menor
 * início depois de `gapStart`) estica seu início para trás até `gapStart`,
 * engolindo o vão que a removida deixou. Sem seguinte, no-op. Fica FORA do
 * `removeFrase` de propósito — o golden testa aquele contra o reference, que não
 * absorve; esta é feature nova pós-reference, como o `dragPhraseBoundary`.
 */
export function absorbNextFrase(
  state: SessionState,
  sceneId: string,
  gapStart: number,
): SessionState {
  let nbK = -1;
  let nbStart = Infinity;
  state.frases.forEach((f, k) => {
    if (
      f.locked &&
      f.span &&
      f.part_link === sceneId &&
      f.span.s > gapStart &&
      f.span.s < nbStart
    ) {
      nbStart = f.span.s;
      nbK = k;
    }
  });
  if (nbK < 0) return state;
  const frases = state.frases.map((f, k) =>
    k === nbK ? { ...f, span: { s: gapStart, e: f.span!.e } } : f,
  );
  return { ...state, frases };
}

/**
 * Arrastar o FIM de uma frase travada (ENG-342) — Pac-Man/ladrilhado, idêntico ao
 * `dragSceneBoundary` (decisão do dono, #2/#4): a frase SEGUINTE da mesma cena
 * SEGUE a fronteira (seu início vira `newE+1`), nas duas direções — encolher NÃO
 * abre vão, a seguinte cresce para preencher; crescer empurra a seguinte. Só o
 * FIM arrasta; o começo é a emenda. Sem seguinte (última frase da cena), cresce/
 * encolhe livre até o fim da cena. Clampa em `[fSpan.s, neighbor.e-1]` (ou o fim
 * da cena) — nenhuma fica vazia. Sem mudança → no-op.
 */
export function dragPhraseBoundary(
  state: SessionState,
  fraseIndex: number,
  toBead: number,
): SessionState {
  const f = state.frases[fraseIndex];
  if (!f || !f.locked || !f.span || f.part_link === null) return state;
  const scene = state.parts.find((p) => p.part_id === f.part_link);
  if (!scene || !scene.span) return state;
  const fSpan = f.span;
  type Nb = { s: number; e: number; k: number };
  // vizinha à direita da MESMA cena (menor início > esta): SEGUE a fronteira
  const neighbor = state.frases.reduce<Nb | null>((acc, fr, k) => {
    if (k === fraseIndex || !fr.locked || !fr.span || fr.part_link !== f.part_link) return acc;
    if (fr.span.s <= fSpan.s) return acc;
    return !acc || fr.span.s < acc.s ? { s: fr.span.s, e: fr.span.e, k } : acc;
  }, null);
  const hardHi = neighbor ? neighbor.e - 1 : scene.span.e;
  const newE = Math.max(fSpan.s, Math.min(hardHi, toBead));
  if (newE === fSpan.e) return state;
  const frases = state.frases.map((fr, k) => {
    if (k === fraseIndex) return { ...fr, span: { s: fSpan.s, e: newE } };
    if (neighbor && k === neighbor.k) return { ...fr, span: { s: newE + 1, e: neighbor.e } };
    return fr;
  });
  return { ...state, frases };
}

/** Foca uma cena produtiva: 1º slot destravado ou auto-add dangling (L837–842). */
export function enterScene(state: SessionState, sceneId: string): SessionState {
  const base = { ...state, activeSceneId: sceneId, selection: null, pendingStart: null };
  const lu = base.frases.findIndex((f) => !f.locked);
  if (lu >= 0) return primeFrase({ ...base, current: { layer: 'frases' as const, index: lu } });
  return addFrase({ ...base, current: { layer: 'frases', index: -1 } });
}

/** enterLayer("frases") (L930–935): assume o ÚLTIMO destravado ou auto-add. */
export function enterFrasesLayer(state: SessionState): SessionState {
  let lu = -1;
  state.frases.forEach((f, k) => {
    if (!f.locked) lu = k;
  });
  const limpo = { ...state, selection: null, pendingStart: null };
  if (lu >= 0) return primeFrase({ ...limpo, current: { layer: 'frases' as const, index: lu } });
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
