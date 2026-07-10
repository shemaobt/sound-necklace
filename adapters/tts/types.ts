/**
 * Porta SpeechSynthesizer — "Ouvir a pergunta" na conversa (PRD v2 §8.7 + redesign
 * O2): fala cada pergunta em voz alta com síntese pt-BR (a linha de base do MVP;
 * prompts humanos gravados são um upgrade pós-MVP). É OPCIONAL — quando o ambiente
 * não tem `speechSynthesis`, a porta simplesmente não é registrada e o botão fica
 * oculto (ausência graciosa). Implementações: real sobre a Web Speech API (web.ts)
 * e fixture determinística headless (fixture.ts).
 */

export type Unsubscribe = () => void;

export interface SpeechSynthesizer {
  /** Fala o texto em pt-BR; cancela qualquer fala em curso antes de começar. */
  speak(text: string): void;
  /** Cancela a fala em curso (se houver). */
  stop(): void;
  /**
   * Assina as transições do estado "falando" — `true` no início da fala, `false`
   * no fim ou ao cancelar. Alimenta o `speaking` do guia (lip-sync).
   */
  onSpeaking(cb: (speaking: boolean) => void): Unsubscribe;
}
