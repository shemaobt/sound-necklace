/**
 * Auto-registro do adapter de granularidade (docs/architecture.md §4): colhido pelo
 * composition root via import.meta.glob. Enquanto a regra O8 não chega (ENG-242), o
 * modo real aponta para o MESMO stub — a troca fica contida neste arquivo.
 */

import { StubGranularityResolver } from './stub';
import type { GranularityResolver } from './types';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<GranularityResolver> = {
  port: 'granularity',
  fixture: () => new StubGranularityResolver(),
  // ENG-242 substitui por RealGranularityResolver (regra O8) — só este factory muda.
  real: () => new StubGranularityResolver(),
};

export default registration;
