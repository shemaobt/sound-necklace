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
  /**
   * Contador de revisão DESTE rascunho no servidor. É a única coisa que distingue um
   * rascunho refeito de um rascunho velho: re-transcrever não toca na gravação, então
   * a versão da gravação diz "igual" mesmo quando o texto mudou por completo.
   *
   * Obrigatório, nunca opcional: um campo que falta convida a preencher com `0`, e `0`
   * é uma confirmação de aparência válida que o servidor recusa — e que nenhum recarregar
   * conserta.
   */
  generation: number;
}

/** Progresso do job de uma sessão. Os rascunhos chegam de uma vez, no fim. */
export interface TranscriptionProgress {
  done: boolean;
  drafts: Record<string, AnswerDraft>;
}

/** O que o servidor devolve quando alguém confirma uma transcrição. */
export interface ConfirmedTranscript {
  /** Inglês DERIVADO do texto confirmado — é este que o artefato emite (ENG-370). */
  en: string;
  /** Contador depois da confirmação; a próxima confirmação precisa levá-lo. */
  generation: number;
}

/**
 * A confirmação foi recusada porque o rascunho mudou por baixo de quem confirmava.
 *
 * Tem tipo próprio porque pede o OPOSTO de uma falha comum: repetir manda a mesma geração
 * vencida e perde de novo, para sempre. Só reler o rascunho resolve — o texto que se
 * editava já não existe.
 */
export class TranscriptSuperseded extends Error {
  constructor(message = 'a transcrição foi refeita no servidor') {
    super(message);
    this.name = 'TranscriptSuperseded';
  }
}

export interface Transcriber {
  /**
   * Dispara o job para as gravações da sessão. Idempotente: repetir com o mesmo
   * pedido não reprocessa — só `force` reabre (é o caso de regravar uma resposta,
   * que invalida o rascunho antigo).
   *
   * `opts.paths` limita o alcance do `force` às respostas nomeadas. Sem ele o force
   * vale para a sessão inteira, que é o que o relatório quer quando não sabe dizer
   * nada mais fino — e é caro demais para uma regravação só.
   */
  start(
    sessionId: string,
    paths: readonly string[],
    opts?: { force?: boolean; paths?: readonly string[] },
  ): Promise<void>;
  /** Pergunta o progresso. Sessão que nunca começou responde concluída e vazia. */
  progress(sessionId: string): Promise<TranscriptionProgress>;
  /**
   * Guarda a transcrição como um humano a confirmou, e devolve o inglês que o servidor
   * derivou DELA. Existe porque o inglês nunca é do cliente: o relatório lê `en__` para
   * montar o artefato, então uma correção aplicada só aqui deixaria o documento com a
   * tradução da frase que ela substituiu.
   *
   * `generation` é o contador que o rascunho carregava — a confirmação é um
   * compare-and-swap. Texto idêntico ao guardado volta na hora, sem traduzir e sem mexer
   * no contador, então reconfirmar não custa nada. Geração vencida rejeita com
   * `TranscriptSuperseded`, e a única saída é reler o rascunho.
   */
  confirm(
    sessionId: string,
    path: string,
    transcript: string,
    generation: number,
  ): Promise<ConfirmedTranscript>;
}
