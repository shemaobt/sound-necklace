/**
 * Porta Transcriber — transcrição (STT) + tradução PT→EN das respostas gravadas
 * da entrevista, como RASCUNHO (PRD v2 §8.7/§12, emenda ENG-326).
 *
 * O trabalho é assíncrono e roda NA NOSSA API, nunca no SPA: o relatório dispara
 * o job ao abrir e pergunta o progresso até terminar. O que volta é conselho, sem
 * autoridade nenhuma — vira resposta só quando um humano confirma o inglês. Um
 * rascunho não confirmado nunca entra em artefato.
 *
 * A chave é o caminho do recurso de voz (`respostas/level{1,2,3}/…/<k>.webm`), o
 * mesmo que `voiceAnswerPath` deriva do slot da pergunta.
 */

/** Rascunho de UMA resposta: o que se ouviu, e o inglês proposto em cima disso. */
export interface AnswerDraft {
  /** transcrição na língua falada — a origem, mantida para conferência bilíngue */
  source: string;
  /** tradução para inglês — é ESTE texto que a facilitadora confirma */
  en: string;
}

/** Progresso do job de uma sessão. Os rascunhos chegam de uma vez, no fim. */
export interface TranscriptionProgress {
  done: boolean;
  drafts: Record<string, AnswerDraft>;
}

export interface Transcriber {
  /**
   * Dispara o job para as gravações da sessão. Idempotente: repetir com o mesmo
   * pedido não reprocessa — só `force` reabre (é o caso de regravar uma resposta,
   * que invalida o rascunho antigo).
   */
  start(sessionId: string, paths: readonly string[], opts?: { force?: boolean }): Promise<void>;
  /** Pergunta o progresso. Sessão que nunca começou responde concluída e vazia. */
  progress(sessionId: string): Promise<TranscriptionProgress>;
}
