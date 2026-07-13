/**
 * Porta SpeechSynthesizer — "Ouvir a pergunta" na conversa (PRD v2 §8.7 + redesign
 * O2): fala cada pergunta em voz alta com síntese pt-BR (a linha de base do MVP;
 * prompts humanos gravados são um upgrade pós-MVP). É OPCIONAL — quando o ambiente
 * não tem `speechSynthesis`, a porta simplesmente não é registrada e o botão fica
 * oculto (ausência graciosa). Implementações: real sobre a Web Speech API (web.ts)
 * e fixture determinística headless (fixture.ts).
 */

export type Unsubscribe = () => void;

/** Idioma default da fala — a linha de base pt-BR do MVP (§8.7). */
export const DEFAULT_SPEECH_LANG = 'pt-BR';

/** Uma fala registrada (hook de teste do fixture). */
export interface SpokenUtterance {
  text: string;
  lang: string;
}

export interface SpeechSynthesizer {
  /**
   * Fala o texto no idioma pedido (BCP-47; default pt-BR) e cancela a fala em curso
   * antes de começar. O idioma acompanha a UI (ENG-279/280): a pergunta exibida em
   * inglês é falada em inglês — texto e voz nunca divergem.
   */
  speak(text: string, lang?: string): void;
  /** Cancela a fala em curso (se houver). */
  stop(): void;
  /**
   * Assina as transições do estado "falando" — `true` no início da fala, `false`
   * no fim ou ao cancelar. Alimenta o `speaking` do guia (lip-sync).
   */
  onSpeaking(cb: (speaking: boolean) => void): Unsubscribe;
}
