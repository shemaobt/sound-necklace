import { useEffect, useState } from 'react';

import type { VoiceRecorder } from '../../../adapters/voice/types';
import { type Mapping, type QuestionSlot, voiceAnswerPath } from '../../../domain';

import { isSkipped } from './answered';

/**
 * O atalho "é igual à cena anterior" (ENG-671, revisão v4 da Márcia · item 06) e o
 * chip que mostra O QUE a cena anterior respondeu (ENG-678).
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
 * frase que entra no .md — é que vem do domínio. O chip, ao contrário, é cópia de UI:
 * ele NUNCA chega perto da célula exportada.
 */
export interface SameAsPrevious {
  /** A frase inglesa congelada que o toque escreve na célula da resposta. */
  answer: string;
  /** Qual das duas perguntas é — decide só o rótulo do botão na tela. */
  kind: 'people' | 'place';
  /** A pergunta da cena anterior de onde o chip tira o que ecoar. */
  previous: PreviousSlot;
}

export interface PreviousSlot {
  /** O texto já confirmado da cena anterior. Vazio = ainda não há palavras. */
  text: string;
  /** Onde estaria a gravação daquela resposta — a pergunta que o chip faz à porta. */
  voicePath: string;
}

/**
 * O que a cena anterior tem para ecoar. `null` cobre DUAS situações que a tela trata
 * igual: não há nada a ecoar, e ainda se está procurando. Colapsá-las é deliberado —
 * as duas levam a "não ofereça", e mantê-las separadas criava dois portões para uma
 * decisão só, dos quais um ficaria sem teste atrás.
 */
export type PreviousEcho = { kind: 'text'; text: string } | { kind: 'voice' };

/**
 * "Cena anterior que já fez a mesma pergunta" é lido da própria sequência: as
 * perguntas de nível 2 se repetem por cena travada, então um item de nível 2 com a
 * mesma chave ANTES deste é a mesma pergunta numa cena anterior (protótipo
 * `_hasPrevSame`, docs/design/prototype.html L1631). Procura-se de trás para frente:
 * "a cena anterior" é a última que perguntou, não a primeira.
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

  for (let i = index - 1; i >= 0; i--) {
    const earlier = sequence[i]!;
    if (earlier.level !== 2 || earlier.k !== slot.k) continue;
    return {
      answer,
      kind: slot.k === 'quem' ? 'people' : 'place',
      previous: {
        text: (mapping?.level2[earlier.partId]?.[earlier.k] ?? '').trim(),
        voicePath: voiceAnswerPath(earlier),
      },
    };
  }
  return null;
}

/**
 * O que a cena anterior deixou para ecoar (ENG-678). O texto confirmado é o melhor
 * caso, mas é o RARO durante a entrevista: ela é só-voz, e as palavras só chegam na
 * revisão. Sem texto, a única pergunta honesta é se existe gravação — e ela é uma ida
 * à porta, então a resposta demora e `null` diz "ainda não sei".
 *
 * `has` é tudo o que se pergunta. A DURAÇÃO do protótipo (`· 0:12`) fica de fora de
 * propósito: §9.2 proíbe dígito na tela de quem ouve, e o precedente já está nesta
 * mesma estação — a confirmação de regravar diz "cerca de um minuto", por extenso,
 * exatamente por isso. E um tamanho não ajuda na decisão que o chip serve: saber que
 * a resposta anterior durou doze segundos não diz se as pessoas são as mesmas.
 */
export function usePreviousEcho(
  previous: PreviousSlot | null,
  recorder: VoiceRecorder | null,
): PreviousEcho | null {
  const text = previous?.text ?? '';
  const path = previous?.voicePath;
  /**
   * O veredito da porta JUNTO do caminho que ele responde. Guardar o par, em vez de
   * zerar o veredito quando o caminho muda, é o que mantém o efeito sem `setState`
   * síncrono — e é também o que impede a resposta de uma pergunta de valer para outra.
   */
  const [probe, setProbe] = useState<{ path: string; found: boolean } | null>(null);

  useEffect(() => {
    // com texto não há o que perguntar; sem porta de voz não há a quem perguntar
    if (!recorder || !path || text) return;
    let alive = true;
    recorder.has(path).then(
      (found) => {
        if (alive) setProbe({ path, found });
      },
      () => {
        // a porta falhou: sem prova de gravação, não se promete eco nenhum
        if (alive) setProbe({ path, found: false });
      },
    );
    return () => {
      alive = false;
    };
  }, [path, text, recorder]);

  if (!previous) return null;
  if (text) return { kind: 'text', text };
  if (!recorder || !path) return null;
  return probe?.path === path && probe.found ? { kind: 'voice' } : null;
}
