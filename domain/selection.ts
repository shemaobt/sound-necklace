/**
 * Modelo de clique de seleção durante a DEFINIÇÃO de um segmento (cena/frase).
 *
 * **Decisão do dono, 2026-08-07 (à noite), com o app rodando na frente.** Substitui o
 * `cordInteraction` restaurado horas antes; o que sobreviveu dele é a escolha da borda
 * MAIS PRÓXIMA (L578–582) e a saturação entre fronteira e fim do colar (L566–567). O
 * motivo é de ouvido, não de código: com o slot pré-ancorado e `playEdge`, quem corta
 * só escutava ~1 s solto em volta de bordas cuja posição ainda não conhecia. Agora a
 * história CORRE enquanto ele decide.
 *
 * Três tempos:
 *  1. **sem seleção** → o clique fixa o COMEÇO ali e o áudio SEGUE dali em diante
 *     (`run`), até o fim do pai;
 *  2. **com `pendingStart`** → fecha o trecho; o áudio PARA se o playhead já passou do
 *     fim marcado e CONTINUA se ainda não chegou (`set-end` — a decisão depende do
 *     playhead, que é runtime, então mora na UI);
 *  3. **trecho fechado** → move a borda mais próxima e toca o TRECHO RESULTANTE
 *     inteiro (`range`), não só a borda.
 *
 * Duas consequências que vale nomear:
 * - clicar a própria conta de COMEÇO cai no ramo 3, move o começo para onde ele já
 *   está e reouve o trecho — é o que faz as vezes do botão `▶ tocar este pedaço`
 *   (`playSel`, L262) que a ENG-291 tirou destas estações;
 * - sem pré-ancoragem, o começo vem do clique, então vão acidental entre cenas passa a
 *   ser possível. Era uma garantia que a emenda dava de graça (docs/segmentation-rules.md
 *   regra 2).
 */

import { activeAnchor } from './frontier';
import type { SessionState } from './state';

export type PlayAction =
  /** Sem ancoragem ativa: o toque é transporte (toca a conta). */
  | { type: 'transport'; bead: number }
  /** Marcou o começo: tocar dali em diante, até o fim do pai. */
  | { type: 'run'; from: number }
  /** Fechou o trecho: parar se o playhead já passou de `end`, senão deixar correr. */
  | { type: 'set-end'; end: number }
  /** Ajustou uma borda: tocar o trecho resultante inteiro. */
  | { type: 'range'; s: number; e: number };

export interface ClickResult {
  state: SessionState;
  play: PlayAction | null;
}

export function clickBead(state: SessionState, bead: number): ClickResult {
  if (!state.totalBeads || state.review) return { state, play: null };
  const aa = activeAnchor(state);
  if (!aa) return { state, play: { type: 'transport', bead } };

  // L566–567: o clique satura entre a fronteira e o fim do colar
  const b = Math.max(aa.start, Math.min(state.whole.span.e, bead));

  if (state.selection === null) {
    return {
      state: { ...state, pendingStart: b, selection: { s: b, e: b } },
      play: { type: 'run', from: b },
    };
  }

  if (state.pendingStart !== null) {
    const s = Math.min(state.pendingStart, b);
    const e = Math.max(state.pendingStart, b);
    return {
      state: { ...state, selection: { s, e }, pendingStart: null },
      play: { type: 'set-end', end: e },
    };
  }

  // borda mais próxima; no empate o COMEÇO cede (o `<=` da referência, L580)
  const { s: selS, e: selE } = state.selection;
  const moveStart = b <= selS || (b < selE && b - selS <= selE - b);
  const selection = moveStart ? { s: b, e: selE } : { s: selS, e: b };
  return { state: { ...state, selection }, play: { type: 'range', ...selection } };
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
