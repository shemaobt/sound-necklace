import type { Mapping, QuestionSlot } from '../../../domain';

import { isSkipped } from './answered';

/**
 * O atalho "é igual à cena anterior" (ENG-671, revisão v4 da Márcia · item 06).
 *
 * Da segunda cena em diante, as duas perguntas de nível 2 que o roteiro repete cena
 * a cena — quem aparece, onde acontece — deixam de exigir uma segunda gravação da
 * mesma resposta: um toque escreve a frase inglesa congelada do roteiro
 * (`same_as_previous_en`) direto na célula. É uma pessoa confirmando, num ato, que a
 * resposta é a mesma; não é rascunho e não pede segunda confirmação.
 *
 * A REGRA mora aqui, na `ui/`, e não no domínio, pelo mesmo motivo que a marca de
 * "sem resposta" de `./answered`: ela decide o que a TELA oferece, e o artefato não
 * distingue a resposta dada por um toque de qualquer outra. O que é congelado — a
 * frase que entra no .md — é que vem do domínio.
 */
export interface SameAsPrevious {
  /** A frase inglesa congelada que o toque escreve na célula da resposta. */
  answer: string;
  /** Qual das duas perguntas é — decide só o rótulo do botão na tela. */
  kind: 'people' | 'place';
}

/**
 * "Cena anterior que já fez a mesma pergunta" é lido da própria sequência: as
 * perguntas de nível 2 se repetem por cena travada, então um item de nível 2 com a
 * mesma chave ANTES deste é, necessariamente, a mesma pergunta numa cena anterior
 * (protótipo `_hasPrevSame`, docs/design/prototype.html L1631).
 *
 * A oferta morre no instante em que a pergunta TEM resposta — texto na célula ou
 * recusa registrada. A resposta GRAVADA não se decide aqui: quem sabe dela é a tela,
 * pelo estado do gravador, e perguntá-la daqui seria uma ida à rede.
 */
export function sameAsPreviousFor(
  mapping: Mapping | null,
  sequence: readonly QuestionSlot[],
  index: number,
): SameAsPrevious | null {
  const slot = sequence[index];
  if (!slot || slot.level !== 2) return null;
  const answer = slot.question.same_as_previous_en;
  if (!answer) return null;
  if ((mapping?.level2[slot.partId]?.[slot.k] ?? '').trim()) return null;
  if (isSkipped(mapping, slot)) return null;
  const asked = sequence
    .slice(0, index)
    .some((earlier) => earlier.level === 2 && earlier.k === slot.k);
  return asked ? { answer, kind: slot.k === 'quem' ? 'people' : 'place' } : null;
}
