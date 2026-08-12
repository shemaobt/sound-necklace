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
  paths: string[];
  polls: number;
  /** Sobe a cada reprocessamento, como o contador do servidor: é o que marca o rascunho novo. */
  generation: number;
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

function draftFor(path: string, generation: number): AnswerDraft {
  const k = slotOf(path);
  return {
    source: `[transcrição fixture] resposta de ${k}`,
    en: `[fixture translation] answer for ${k}`,
    generation,
  };
}

export class FixtureTranscriber implements Transcriber {
  readonly #jobs = new Map<string, Job>();

  start(
    sessionId: string,
    paths: readonly string[],
    opts?: { force?: boolean; paths?: readonly string[] },
  ): Promise<void> {
    const current = this.#jobs.get(sessionId);
    // Sem force, um job existente não RECOMEÇA — reabrir zeraria `polls` e adiaria a
    // conclusão, e reabrir um concluído apagaria rascunhos que a facilitadora pode
    // estar revisando. Mas ele CRESCE: o servidor deriva as respostas da própria
    // sessão (o adapter HTTP ignora `paths` de propósito), então cada pedido semeia o
    // rascunho que faltar. A entrevista dispara por resposta, uma de cada vez;
    // congelar o job no primeiro pedido deixava todas as outras sem rascunho.
    if (current && !opts?.force) {
      for (const p of paths) if (!current.paths.includes(p)) current.paths.push(p);
      return Promise.resolve();
    }
    // Force recomeça. O alcance (`opts.paths`) diz quais rascunhos o SERVIDOR joga
    // fora; aqui todos são regerados de forma determinística, então o que importa
    // preservar é a UNIÃO dos caminhos — sem ela um force nomeado encolheria o job
    // para a única resposta regravada e sumiria com as outras.
    const union = current ? [...new Set([...current.paths, ...paths])] : [...paths];
    this.#jobs.set(sessionId, {
      paths: union,
      polls: 0,
      generation: (current?.generation ?? 0) + 1,
    });
    return Promise.resolve();
  }

  progress(sessionId: string): Promise<TranscriptionProgress> {
    const job = this.#jobs.get(sessionId);
    if (!job || job.paths.length === 0) return Promise.resolve({ done: true, drafts: {} });
    job.polls += 1;
    if (job.polls < POLLS_TO_FINISH) return Promise.resolve({ done: false, drafts: {} });
    const drafts: Record<string, AnswerDraft> = {};
    for (const p of job.paths) drafts[p] = draftFor(p, job.generation);
    return Promise.resolve({ done: true, drafts });
  }
}
