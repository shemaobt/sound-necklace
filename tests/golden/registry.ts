/**
 * Registro de replayers do golden harness.
 *
 * Cada issue de domain/contracts REGISTRA aqui o replay dos passos que ela
 * implementa (ENG-214 grid/hash → ENG-216 cenas → ENG-219 triagem →
 * ENG-223 frases/costura → ENG-226 respostas → ENG-227/233 export real).
 * Um caso sem replayer aparece como PENDENTE (verde com aviso) até a ENG-238
 * ligar o modo estrito (zero pendências).
 *
 * Contrato: um replayer recebe os passos do caso e devolve os artefatos como
 * strings byte-exatas (mesma serialização da referência).
 */
export interface GoldenStep {
  type: string;
  [key: string]: unknown;
}

export interface GoldenCase {
  name: string;
  description: string;
  steps: GoldenStep[];
}

export type Replayer = (steps: GoldenStep[]) => Record<string, string>;

export const replayers: Record<string, Replayer> = {
  // vazio de propósito — ver comentário acima
};

/** ENG-238 liga isto: com strict=true, casos pendentes REPROVAM o harness. */
export const STRICT = false;
