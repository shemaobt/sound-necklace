/**
 * Modo fixture do Transcriber — roda o fluxo inteiro sem API nenhuma.
 *
 * Determinístico de propósito (padrão da casa): o texto do rascunho sai do
 * próprio caminho da gravação, então o mesmo pedido produz sempre os mesmos
 * rascunhos e os testes não precisam de relógio nem de sorte. O job "demora"
 * contando chamadas de `progress`, não milissegundos — nada de timer para o
 * teste esperar.
 */

import type { AnswerDraft, Transcriber, TranscriptionProgress } from './types';

/** Quantas consultas o job leva para ficar pronto (só para dar o estado "rodando"). */
const POLLS_TO_FINISH = 2;

interface Job {
  paths: readonly string[];
  polls: number;
}

/** `respostas/level2/PT1/quem.webm` → `quem` (a pergunta), o que basta para variar. */
function slotOf(path: string): string {
  return (
    path
      .split('/')
      .pop()
      ?.replace(/\.webm$/, '') ?? path
  );
}

function draftFor(path: string): AnswerDraft {
  const k = slotOf(path);
  return {
    source: `[transcrição fixture] resposta de ${k}`,
    en: `[fixture translation] answer for ${k}`,
  };
}

export class FixtureTranscriber implements Transcriber {
  readonly #jobs = new Map<string, Job>();

  start(sessionId: string, paths: readonly string[], opts?: { force?: boolean }): Promise<void> {
    const current = this.#jobs.get(sessionId);
    // sem force, um job já concluído fica como está — reabrir apagaria rascunhos
    // que a facilitadora pode estar revisando neste instante
    if (current && !opts?.force && current.polls >= POLLS_TO_FINISH) return Promise.resolve();
    this.#jobs.set(sessionId, { paths: [...paths], polls: 0 });
    return Promise.resolve();
  }

  progress(sessionId: string): Promise<TranscriptionProgress> {
    const job = this.#jobs.get(sessionId);
    if (!job || job.paths.length === 0) return Promise.resolve({ done: true, drafts: {} });
    job.polls += 1;
    if (job.polls < POLLS_TO_FINISH) return Promise.resolve({ done: false, drafts: {} });
    const drafts: Record<string, AnswerDraft> = {};
    for (const p of job.paths) drafts[p] = draftFor(p);
    return Promise.resolve({ done: true, drafts });
  }
}
