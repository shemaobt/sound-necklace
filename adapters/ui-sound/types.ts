/**
 * Porta UiSound — a voz da interface (protótipo `_blip`/`_chime`/`_lock`/
 * `_pearlClick`). São TONS SINTETIZADOS, nunca conteúdo: nada aqui fala, nomeia
 * ou interpreta a história — a regra "no AI-generated content" segue de pé.
 *
 * O vocabulário é o do protótipo, e cada voz tem um sentido próprio: quem ouve
 * distingue "travei uma decisão" de "subi de etapa" de "não pode" sem ler nada,
 * que é o ponto de um app ear-first (PRD v2 §9).
 *
 * O `_pearlClick` do protótipo NÃO foi portado, de propósito: lá ele toca a cada
 * conta durante a reprodução porque o protótipo não tem áudio — os bipes SÃO o
 * substituto da história. Aqui a história toca de verdade, e bipar por cima dela
 * (ou antes da primeira sílaba, ao tocar uma conta) atropelaria justamente o que
 * o app existe para fazer ouvir. Toque em conta já é respondido pelo áudio (§8.2).
 *
 * Implementações: Web Audio real (web-audio.ts) e silenciosa (silent.ts). O
 * cabeçalho mudo é a própria silenciosa — o composition root troca a porta.
 */
export interface UiSound {
  /** Decisão presa: cena/frase travada, "nenhum se encaixa", costura movida. */
  lock(): void;
  /** Subiu de etapa (protótipo `_chime`): duas notas ascendentes. */
  advance(): void;
  /** A ação não é possível — grave e curto, nunca punitivo (§9.4). */
  refuse(): void;
  /** Toque miúdo de UI: escolher um tipo, abrir, voltar. */
  tap(): void;
  /** A gravação começou. */
  recordStart(): void;
  /** A gravação terminou. */
  recordStop(): void;
  /** Um documento foi guardado. */
  saved(): void;
}
