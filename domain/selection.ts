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

  // O começo é a fronteira — a menos que já tenham ARRASTADO a extremidade inicial
  // para frente (`dragSelectionStart`), abrindo um buraco de propósito. Reler a
  // fronteira aqui desfaria esse arrasto no clique seguinte, que é justamente o
  // clique que fecha o segmento.
  const start = Math.max(aa.start, state.selection?.s ?? aa.start);
  const b = Math.min(state.whole.span.e, Math.max(0, bead));

  // clicar no começo (ou antes) → OUVIR a partir do começo; não mexe na seleção
  if (b <= start) return { state, play: { type: 'listen', from: start } };

  // clicar além → define o FIM; o começo continua onde está (clique nunca o move)
  return {
    state: { ...state, selection: { s: start, e: b }, pendingStart: null },
    play: { type: 'set-end', end: b },
  };
}

/**
 * Arrasta o COMEÇO do segmento em definição (decisão do dono, 2026-08-06).
 *
 * O áudio é CRU: quem gravou às vezes erra, repete, hesita. Para esse trecho não
 * virar ruído no treinamento, o usuário precisa deixá-lo FORA de qualquer cena ou
 * frase — não removê-lo, não pulá-lo na escuta, não excluí-lo do artefato. Só não
 * selecionar. Empurrar o começo para frente é o que abre esse buraco: o trecho
 * entre o fim do segmento anterior e o novo começo não pertence a ninguém.
 *
 * Isto revoga a parte "o começo NUNCA é settável" da regra 2 de
 * docs/segmentation-rules.md; o resto dela continua — o clique segue setando só o
 * fim, e mover o começo exige o gesto deliberado do arrasto.
 *
 * Dois limites, e os dois são o que o `confirmPart` já cobrava: nunca antes da
 * fronteira (sobrepor o segmento anterior segue proibido) e nunca depois do fim já
 * escolhido. `pendingStart` acompanha o começo em vez de zerar: arrastar não
 * escolhe fim nenhum, e é o `pendingStart` não-nulo que faz o confirmar pedir
 * "clique onde termina".
 */
export function dragSelectionStart(state: SessionState, bead: number): SessionState {
  if (!state.totalBeads || state.review) return state;
  const aa = activeAnchor(state);
  if (!aa || !state.selection) return state;

  // Sem fim escolhido a seleção é o degenerado {fronteira, fronteira}: o começo
  // arrasta a coisa inteira, e o teto é o fim do colar. Com fim escolhido, ele é o
  // teto — o começo não passa por cima do que já foi decidido.
  const pending = state.pendingStart !== null;
  const ceil = pending ? state.whole.span.e : state.selection.e;
  const s = Math.min(ceil, Math.max(aa.start, bead));
  if (s === state.selection.s) return state;
  return {
    ...state,
    selection: { s, e: pending ? s : state.selection.e },
    pendingStart: pending ? s : null,
  };
}
