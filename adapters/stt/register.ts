/**
 * Registro do adapter de transcrição. O modo real fala com o job assíncrono da API
 * (ENG-325); o fixture roda o fluxo inteiro sem backend. baseUrl/token/language reais
 * chegam pelo wiring do composition root (ENG-247); sem wiring, vale o esqueleto —
 * baseUrl relativo + fetch do browser + a língua default.
 */

import { FixtureTranscriber } from './fixture';
import { HttpTranscriber, type HttpSttDeps } from './http';
import type { Transcriber } from './types';

/** Wiring opcional do composition root. */
export type RealSttWiring = Partial<HttpSttDeps>;

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: (wiring?: RealSttWiring) => TPort;
}

const registration: AdapterRegistration<Transcriber> = {
  port: 'stt',
  fixture: () => new FixtureTranscriber(),
  real: (wiring = {}) =>
    new HttpTranscriber({
      baseUrl: wiring.baseUrl ?? '/api',
      fetch: wiring.fetch ?? globalThis.fetch.bind(globalThis),
      language: wiring.language ?? (() => 'pt-BR'),
      token: wiring.token,
      onUnauthorized: wiring.onUnauthorized,
    }),
};

export default registration;
