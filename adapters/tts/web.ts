/**
 * Implementação real do SpeechSynthesizer sobre a Web Speech API. Fala em pt-BR
 * (seleciona uma voz `pt-BR`, com fallback documentado para qualquer voz `pt-*` e,
 * na ausência de ambas, a voz padrão do sistema), cancela a fala anterior antes de
 * cada nova, e reflete os eventos `start`/`end`/`error` do utterance no estado
 * "falando". As dependências de plataforma são injetáveis para os testes de nó
 * (sem síntese real no CI); num ambiente sem a API, `speak`/`stop` são no-ops.
 */

import type { SpeechSynthesizer, Unsubscribe } from './types';

const LANG = 'pt-BR';

export interface WebSpeechDeps {
  synth?: SpeechSynthesis;
  UtteranceCtor?: typeof SpeechSynthesisUtterance;
}

/** Feature-detect da Web Speech API (§8.7): a porta só é registrada quando presente. */
export function speechSynthesisSupported(
  scope: { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown } = globalThis,
): boolean {
  return (
    typeof scope.speechSynthesis !== 'undefined' &&
    typeof scope.SpeechSynthesisUtterance !== 'undefined'
  );
}

export class WebSpeechSynthesizer implements SpeechSynthesizer {
  readonly #subs = new Set<(speaking: boolean) => void>();
  readonly #synth?: SpeechSynthesis;
  readonly #UtteranceCtor?: typeof SpeechSynthesisUtterance;

  constructor(deps: WebSpeechDeps = {}) {
    this.#synth =
      deps.synth ?? (typeof speechSynthesis !== 'undefined' ? speechSynthesis : undefined);
    this.#UtteranceCtor =
      deps.UtteranceCtor ??
      (typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : undefined);
  }

  speak(text: string): void {
    if (!this.#synth || !this.#UtteranceCtor) return;
    this.#synth.cancel(); // encerra a fala anterior antes de começar
    const utterance = new this.#UtteranceCtor(text);
    utterance.lang = LANG;
    const voice = this.#pickVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => this.#emit(true);
    utterance.onend = () => this.#emit(false);
    utterance.onerror = () => this.#emit(false);
    this.#synth.speak(utterance);
  }

  stop(): void {
    this.#synth?.cancel();
    this.#emit(false);
  }

  onSpeaking(cb: (speaking: boolean) => void): Unsubscribe {
    this.#subs.add(cb);
    return () => this.#subs.delete(cb);
  }

  #pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.#synth?.getVoices() ?? [];
    const lower = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
    return (
      voices.find((v) => lower(v) === 'pt-br') ?? voices.find((v) => lower(v).startsWith('pt'))
    );
  }

  #emit(speaking: boolean): void {
    for (const cb of this.#subs) cb(speaking);
  }
}
