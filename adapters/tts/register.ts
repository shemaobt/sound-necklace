/**
 * Auto-registro do adapter de TTS (docs/architecture.md §4): o composition root
 * (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e resolve
 * portas por nome.
 *
 * O modo real fala com o serviço de TTS da plataforma (ENG-283, voz ElevenLabs) e leva
 * o Web Speech DENTRO de si como fallback — se a API não responde ou ainda não está
 * deployada, o guia continua falando. Por isso a porta é registrada incondicionalmente:
 * antes ela sumia num ambiente sem `speechSynthesis`, o que hoje apagaria também os
 * clipes da API, que não dependem dele.
 *
 * baseUrl/token reais chegam pelo wiring do composition root (ENG-247): `real()` aceita
 * as dependências injetáveis do HttpSpeechSynthesizer (menos o fallback, que É a
 * composição de produção). Sem wiring, vale o esqueleto — baseUrl relativo + fetch do
 * browser, e o fallback assume no 404.
 */

import { FixtureSpeechSynthesizer } from './fixture';
import { HttpSpeechSynthesizer, type HttpSpeechDeps } from './http';
import type { SpeechSynthesizer } from './types';
import { WebSpeechSynthesizer } from './web';

/** Wiring opcional do composition root; o fallback nunca é substituível. */
export type RealTtsWiring = Partial<Omit<HttpSpeechDeps, 'fallback'>>;

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: (wiring?: RealTtsWiring) => TPort;
}

const registration: AdapterRegistration<SpeechSynthesizer> = {
  port: 'tts',
  fixture: () => new FixtureSpeechSynthesizer(),
  real: (wiring = {}) =>
    new HttpSpeechSynthesizer({
      baseUrl: wiring.baseUrl ?? '/api',
      fetch: wiring.fetch ?? globalThis.fetch.bind(globalThis),
      token: wiring.token,
      onUnauthorized: wiring.onUnauthorized,
      AudioCtor: wiring.AudioCtor,
      createObjectURL: wiring.createObjectURL,
      fallback: new WebSpeechSynthesizer(),
    }),
};

export default registration;
