/**
 * Modo fixture do SpeechSynthesizer — roda headless (sem Web Speech API): registra
 * os textos falados e emite as transições do estado "falando" de forma
 * determinística. Falar uma nova pergunta cancela a anterior (encerra → inicia).
 */

import {
  DEFAULT_SPEECH_LANG,
  type SpeechSynthesizer,
  type SpokenUtterance,
  type Unsubscribe,
} from './types';

export class FixtureSpeechSynthesizer implements SpeechSynthesizer {
  readonly #subs = new Set<(speaking: boolean) => void>();
  readonly #spoken: SpokenUtterance[] = [];
  #speaking = false;

  /** Falas registradas, em ordem, com o idioma de cada uma (hook de teste). */
  get spoken(): readonly SpokenUtterance[] {
    return this.#spoken;
  }

  speak(text: string, lang: string = DEFAULT_SPEECH_LANG): void {
    if (this.#speaking) this.#emit(false); // encerra a fala anterior
    this.#spoken.push({ text, lang });
    this.#emit(true);
  }

  stop(): void {
    if (this.#speaking) this.#emit(false);
  }

  onSpeaking(cb: (speaking: boolean) => void): Unsubscribe {
    this.#subs.add(cb);
    return () => this.#subs.delete(cb);
  }

  #emit(speaking: boolean): void {
    this.#speaking = speaking;
    for (const cb of this.#subs) cb(speaking);
  }
}
