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
 * baseUrl/token reais são injetados pelo wiring (ENG-247); até lá vale o mesmo esqueleto
 * dos outros adapters (adapters/bucket/register.ts) — baseUrl relativo e o fetch do browser.
 */

import { FixtureSpeechSynthesizer } from './fixture';
import { HttpSpeechSynthesizer } from './http';
import type { SpeechSynthesizer } from './types';
import { WebSpeechSynthesizer } from './web';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<SpeechSynthesizer> = {
  port: 'tts',
  fixture: () => new FixtureSpeechSynthesizer(),
  real: () =>
    new HttpSpeechSynthesizer({
      baseUrl: '/api',
      fetch: globalThis.fetch.bind(globalThis),
      fallback: new WebSpeechSynthesizer(),
    }),
};

export default registration;
