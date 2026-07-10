/**
 * Caminho canônico de uma resposta de voz — reutiliza o construtor do domínio
 * (`voiceAnswerPath`, §10.4/O5) e valida contra o schema de contrato
 * (`ResourcePathSchema`). É o único ponto onde um AnswerSlot vira ResourcePath.
 */

import { voiceAnswerPath, type AnswerSlot } from '../../domain';

import { ResourcePathSchema, type ResourcePath } from '../../contracts';

export function answerResourcePath(slot: AnswerSlot): ResourcePath {
  return ResourcePathSchema.parse(voiceAnswerPath(slot));
}
