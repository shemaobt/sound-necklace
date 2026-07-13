/**
 * Implementação real do SpeechSynthesizer sobre a Web Speech API. Fala em pt-BR
 * (seleciona uma voz `pt-BR`, com fallback documentado para qualquer voz `pt-*` e,
 * na ausência de ambas, a voz padrão do sistema), cancela a fala anterior antes de
 * cada nova, e reflete os eventos `start`/`end`/`error` do utterance no estado
 * "falando". As dependências de plataforma são injetáveis para os testes de nó
 * (sem síntese real no CI); num ambiente sem a API, `speak`/`stop` são no-ops.
 */

import { DEFAULT_SPEECH_LANG, type SpeechSynthesizer, type Unsubscribe } from './types';

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

  // ponytail: sem keep-alive para o corte de ~15 s de fala longa do Chrome (pause/resume
  // periódico). As perguntas do roteiro são curtas; a mais longa (L1 `ausencia`) é o único
  // risco real. Se ela cortar em campo, o upgrade é um setInterval pausa/retoma no onstart.
  speak(text: string, lang: string = DEFAULT_SPEECH_LANG): void {
    if (!this.#synth || !this.#UtteranceCtor) return;
    this.#synth.cancel(); // encerra a fala anterior antes de começar
    const utterance = new this.#UtteranceCtor(text);
    utterance.lang = lang;
    const voice = this.#pickVoice(lang);
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

  /**
   * Voz do idioma PEDIDO: casamento exato (`pt-BR`), senão qualquer variante da mesma
   * língua (`pt-PT`). Sem nenhuma, devolve `undefined` e o motor escolhe — NUNCA se
   * empresta a voz de outra língua: uma voz pt-BR lendo texto inglês sai ininteligível.
   */
  #pickVoice(lang: string): SpeechSynthesisVoice | undefined {
    const voices = this.#synth?.getVoices() ?? [];
    const norm = (s: string) => s.replace('_', '-').toLowerCase();
    const want = norm(lang);
    const base = want.split('-')[0]!;
    return (
      voices.find((v) => norm(v.lang) === want) ??
      voices.find((v) => norm(v.lang) === base || norm(v.lang).startsWith(`${base}-`))
    );
  }

  #emit(speaking: boolean): void {
    for (const cb of this.#subs) cb(speaking);
  }
}
