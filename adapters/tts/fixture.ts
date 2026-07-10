/**
 * Modo fixture do SpeechSynthesizer — roda headless (sem Web Speech API): registra
 * os textos falados e emite as transições do estado "falando" de forma
 * determinística. Falar uma nova pergunta cancela a anterior (encerra → inicia).
 */

import type { SpeechSynthesizer, Unsubscribe } from './types';

export class FixtureSpeechSynthesizer implements SpeechSynthesizer {
  readonly #subs = new Set<(speaking: boolean) => void>();
  readonly #spoken: string[] = [];
  #speaking = false;

  /** Textos falados, em ordem (hook de teste). */
  get spoken(): readonly string[] {
    return this.#spoken;
  }

  speak(text: string): void {
    if (this.#speaking) this.#emit(false); // encerra a fala anterior
    this.#spoken.push(text);
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
