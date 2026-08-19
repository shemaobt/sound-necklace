import {
  questionSequence,
  setAnswer,
  voiceAnswerPath,
  type AnswerSlot,
  type Mapping,
  type SessionState,
} from '../../../domain';

/**
 * A pergunta que ficou SEM RESPOSTA de propósito.
 *
 * Até aqui o answer store tinha uma única forma para duas coisas diferentes: a string
 * vazia dizia tanto "ainda não perguntei" quanto "perguntei, e a pessoa preferiu não
 * responder". Indistinguíveis, a segunda herdava o destino da primeira — a retomada
 * procura a primeira pergunta em aberto, e uma recusa ficava em aberto para sempre.
 * Toda reabertura caía na mesma pergunta, e a revisão, que só abre sozinha quando não
 * há mais o que perguntar (ENG-367), ficava inalcançável.
 *
 * A marca é uma chave reservada no MESMO balde das respostas, como `nota__`, `en__` e
 * `src__`: nada enumera esse balde — tudo o lê por chave de pergunta conhecida —, então
 * ela é invisível para quem não a procura. É por construção, e não por lembrança, que
 * `buildMapReport` segue emitindo `_(no answer)_` para a célula vazia: o artefato não
 * distingue recusa de ausência, e não deve — essa diferença interessa a quem conduz a
 * entrevista, não ao pipeline. Por isso a marca mora na `ui/` e as camadas congeladas
 * ficam onde estão.
 */
const SKIPPED_PREFIX = 'skipped__';

/** Valor da marca. Legível para quem abrir o documento de estado com os olhos. */
const SKIPPED = 'skipped';

function skippedSlot(slot: AnswerSlot): AnswerSlot {
  const k = SKIPPED_PREFIX + slot.k;
  if (slot.level === 1) return { level: 1, k };
  if (slot.level === 2) return { level: 2, partId: slot.partId, k };
  return { level: 3, propId: slot.propId, k };
}

function read(m: Mapping | null, slot: AnswerSlot): string {
  if (!m) return '';
  if (slot.level === 1) return m.level1[slot.k] ?? '';
  if (slot.level === 2) return m.level2[slot.partId]?.[slot.k] ?? '';
  return m.level3[slot.propId]?.[slot.k] ?? '';
}

/** Esta pergunta foi marcada como sem resposta? */
export function isSkipped(m: Mapping | null, slot: AnswerSlot): boolean {
  return read(m, skippedSlot(slot)) === SKIPPED;
}

/** Registra que a pergunta ficou sem resposta. */
export function markSkipped(state: SessionState, slot: AnswerSlot): SessionState {
  return setAnswer(state, skippedSlot(slot), SKIPPED);
}

/**
 * Apaga a marca — a pergunta volta a estar em aberto. Escreve a string vazia em vez de
 * remover a chave porque é o que `setAnswer` sabe fazer, e porque uma marca apagada e
 * uma que nunca existiu devem ler igual.
 */
export function clearSkipped(state: SessionState, slot: AnswerSlot): SessionState {
  return setAnswer(state, skippedSlot(slot), '');
}

/**
 * Índice da ÚLTIMA pergunta respondida — texto, voz gravada ou recusa registrada —, ou
 * -1 quando a entrevista não começou. É o que decide onde a conversa reabre (ENG-321) e
 * se a entrevista já chegou ao fim (ENG-367): a última pergunta respondida significa que
 * não há mais o que perguntar, e os buracos atrás dela são recusas deliberadas.
 *
 * Mora aqui, e não na estação, porque desde a ENG-511 o shell faz a mesma pergunta uma
 * tela antes, para decidir onde a sessão retomada abre. Uma regra, um lugar.
 */
export function lastAnsweredIndex(state: SessionState, voiced: readonly string[]): number {
  const sequence = questionSequence(state);
  for (let i = sequence.length - 1; i >= 0; i--) {
    const slot = sequence[i]!;
    if (
      read(state.mapping, slot).trim() ||
      voiced.includes(voiceAnswerPath(slot)) ||
      isSkipped(state.mapping, slot)
    )
      return i;
  }
  return -1;
}
