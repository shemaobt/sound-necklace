/**
 * Registro do adapter de transcrição. O modo real depende do job assíncrono da
 * API (ENG-325), que ainda não existe — inventar um endpoint aqui seria adivinhar
 * a forma do contrato. Até lá `real()` recusa alto, e o composition root monta o
 * fixture.
 */

import { FixtureTranscriber } from './fixture';
import type { Transcriber } from './types';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<Transcriber> = {
  port: 'stt',
  fixture: () => new FixtureTranscriber(),
  real: () => {
    throw new Error(
      'adapters/stt: o modo real espera o job assíncrono de transcrição da API (ENG-325)',
    );
  },
};

export default registration;
