/**
 * Modelo de clique de seleção — port 1:1 do pointerdown do colar
 * (docs/reference/index.html L561–583) + janela do playEdge (L599–605).
 * PRD v2 §8.2, §11.
 *
 * O reducer nunca toca áudio: devolve a ação de play como VALOR (efeito como
 * dado); o intérprete vive nos adapters. A ação `transport` vem do PRD §8.2
 * ("sem ancoragem ativa, o toque é transporte") — na referência o handler só
 * retorna; o estado não muda nos dois casos.
 */

import { activeAnchor } from './frontier';
import type { SessionState } from './state';

export type PlayAction =
  | { type: 'single-bead'; bead: number }
  | { type: 'range'; s: number; e: number }
  | { type: 'edge'; edge: number; s: number; e: number }
  | { type: 'transport'; bead: number };

export interface ClickResult {
  state: SessionState;
  play: PlayAction | null;
}

export function clickBead(state: SessionState, bead: number): ClickResult {
  if (!state.totalBeads || state.review) return { state, play: null };
  const aa = activeAnchor(state);
  if (!aa) return { state, play: { type: 'transport', bead } };

  const b = Math.max(aa.start, Math.min(state.whole.span.e, bead));

  if (state.selection === null) {
    return {
      state: { ...state, pendingStart: b, selection: { s: b, e: b } },
      play: { type: 'single-bead', bead: b },
    };
  }

  if (state.pendingStart !== null) {
    const s = Math.min(state.pendingStart, b);
    const e = Math.max(state.pendingStart, b);
    return {
      state: { ...state, selection: { s, e }, pendingStart: null },
      play: { type: 'range', s, e },
    };
  }

  // nudge da borda mais próxima — comparação exata da referência (L576–579)
  const sel = state.selection;
  let s = sel.s;
  let e = sel.e;
  if (b <= sel.s) s = b;
  else if (b >= sel.e) e = b;
  else if (b - sel.s <= sel.e - b) s = b;
  else e = b;

  const half = Math.max(1, Math.round(1 / state.beadSec));
  return {
    state: { ...state, selection: { s, e } },
    play: {
      type: 'edge',
      edge: b,
      s: Math.max(0, b - half),
      e: Math.min(state.totalBeads - 1, b + half),
    },
  };
}
