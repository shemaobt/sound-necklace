/**
 * Modelo de clique de seleção durante a DEFINIÇÃO de um segmento (cena/frase).
 * PRD v2 §8.2 e docs/segmentation-rules.md (decisão do dono; o modelo
 * de dois-cliques/nudge do reference foi substituído).
 *
 * Regra: o começo do segmento é FIXO na fronteira (pré-ancorado por
 * primePart/primeFrase) — o usuário NUNCA seta o começo, só o FIM. Clicar no
 * começo (ou antes) pede para OUVIR a partir dali; clicar depois define o FIM.
 * A decisão de tocar/parar/continuar depende do playhead (runtime) e vive na UI —
 * o reducer só devolve a INTENÇÃO como dado (effects-as-data) e muda a seleção.
 */

import { activeAnchor } from './frontier';
import type { SessionState } from './state';

export type PlayAction =
  /** Sem ancoragem ativa: o toque é transporte (toca a conta). */
  | { type: 'transport'; bead: number }
  /** Clicou o começo (a fronteira): ouvir a partir de `from`. Seleção intacta. */
  | { type: 'listen'; from: number }
  /** Clicou além do começo: o FIM passou a ser `end` (o começo segue na fronteira). */
  | { type: 'set-end'; end: number };

export interface ClickResult {
  state: SessionState;
  play: PlayAction | null;
}

export function clickBead(state: SessionState, bead: number): ClickResult {
  if (!state.totalBeads || state.review) return { state, play: null };
  const aa = activeAnchor(state);
  if (!aa) return { state, play: { type: 'transport', bead } };

  const start = aa.start; // fronteira = começo fixo do segmento
  const b = Math.min(state.whole.span.e, Math.max(0, bead));

  // clicar no começo (ou antes) → OUVIR a partir do começo; não mexe na seleção
  if (b <= start) return { state, play: { type: 'listen', from: start } };

  // clicar além → define o FIM; o começo permanece na fronteira (nunca settável)
  return {
    state: { ...state, selection: { s: start, e: b }, pendingStart: null },
    play: { type: 'set-end', end: b },
  };
}
