/**
 * Modelo de clique de seleção durante a DEFINIÇÃO de um segmento (cena/frase).
 * Port 1:1 de `cordInteraction` (docs/reference/index.html L561–583), PRD v2 §8.2.
 *
 * Decisão do dono, 2026-08-07: o comportamento do colar na segmentação de
 * cenas/frases fica estritamente igual ao da referência; só o arrasto Pac-Man e o
 * remover-com-absorção são acréscimos. Isto substituiu o modelo
 * ouvir/definir-fim de 2026-07 — ver docs/segmentation-rules.md.
 *
 * Três ramos, na ordem da referência:
 *  1. sem seleção → fixa o começo na conta e toca só ela (L571–573);
 *  2. com `pendingStart` → fecha o trecho entre ele e a conta clicada e toca o
 *     trecho INTEIRO (L574–577). Como `primePart`/`primeFrase` entregam o slot
 *     pré-ancorado na emenda, é aqui que cai o PRIMEIRO clique do ouvinte;
 *  3. trecho fechado → move a borda MAIS PRÓXIMA (o começo inclusive) e toca só
 *     ela (L578–582).
 *
 * A referência é assimétrica: `primePart` só existe para cenas (L698), e
 * `addFrase` (L776) zera a seleção, então a frase gastaria um clique a mais no
 * ramo 1. `primeFrase` fecha essa assimetria — decisão do dono na mesma conversa:
 * cena e frase seguem o mesmo modelo.
 *
 * O reducer devolve a intenção como dado (effects-as-data); quem toca é a UI.
 */

import { activeAnchor } from './frontier';
import type { SessionState } from './state';

export type PlayAction =
  /** Sem ancoragem ativa: o toque é transporte (toca a conta). */
  | { type: 'transport'; bead: number }
  /** `playRange(s,e)` — a conta recém-fixada (s===e) ou o trecho recém-fechado. */
  | { type: 'range'; s: number; e: number }
  /** `playEdge(bead)` — a borda que acabou de se mover, ~1 s de cada lado. */
  | { type: 'edge'; bead: number };

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
      play: { type: 'range', s: b, e: b },
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

  // borda mais próxima; no empate o COMEÇO cede (o `<=` da referência, L580)
  const { s: selS, e: selE } = state.selection;
  const moveStart = b <= selS || (b < selE && b - selS <= selE - b);
  const selection = moveStart ? { s: b, e: selE } : { s: selS, e: b };
  return { state: { ...state, selection }, play: { type: 'edge', bead: b } };
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
