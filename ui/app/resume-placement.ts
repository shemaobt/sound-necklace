/**
 * Onde uma sessão retomada ABRE (ENG-511).
 *
 * O passo salvo no domínio para de responder essa pergunta quando a entrevista acaba:
 * o modo continua `mapeamento`, a Conversa vê que não há mais nada a perguntar e abre a
 * revisão — e uma revisão inteira confirmada não deixa marca durável nenhuma dizendo
 * "acabou". O sinal, porém, é calculável no momento em que importa, a partir do estado
 * que a hidratação já tem na mão. Nada disto vai para o fio: nenhum campo novo no DTO,
 * nada no servidor.
 *
 * Duas condições, nenhuma delas inventada aqui: a entrevista chegou ao fim
 * (`lastAnsweredIndex`, a mesma regra que faz a Conversa abrir na revisão) e não sobrou
 * resposta gravada sem texto confirmado (`reportExportStatus`, o MESMO número que o
 * portão da Export recusa e que o diálogo de sair da revisão conta).
 */

import { reportExportStatus } from '../../contracts';
import { questionSequence, type SessionState } from '../../domain';
import { lastAnsweredIndex } from '../pages/conversation/answered';

/**
 * A revisão desta sessão está inteira pronta — abrir direto em Guardar é o certo?
 *
 * @param voice caminhos (`respostas/…`) que TÊM gravação nesta sessão (`meta.voice`).
 */
export function reviewIsDone(state: SessionState, voice: readonly string[]): boolean {
  const total = questionSequence(state).length;
  // sem perguntas a sessão nem chegou ao mapeamento: não há revisão para estar pronta
  if (total === 0) return false;
  // uma entrevista pela metade abre onde parou, ainda que nada esteja pendente de
  // confirmação — `reportExportStatus` só sabe de gravação sem texto, não de pergunta
  // por fazer
  if (lastAnsweredIndex(state, voice) !== total - 1) return false;
  return reportExportStatus(state, new Set(voice)).canExport;
}
