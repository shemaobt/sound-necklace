/**
 * Auto-registro do adapter de voz (docs/architecture.md §4): o composition root
 * (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e resolve
 * portas por nome — fixture é o default; o modo real liga por configuração de
 * ambiente (ENG-247).
 *
 * O armazém é POR SESSÃO (§10.4): o wiring injeta o `store` da sessão ativa
 * (`ui/app/voice-adapter.ts`); sem wiring nasce um MemoryVoiceStore avulso. A
 * ligação aos recursos REAIS do SessionStore (tripod-api) é o resto da ENG-247.
 */

import { FixtureVoiceRecorder } from './fixture';
import { MemoryVoiceStore } from './memory-store';
import type { VoiceRecorder, VoiceResourceStore } from './types';
import { WebVoiceRecorder } from './web';

/** Wiring do composition root: o armazém de respostas da SESSÃO ativa. */
export interface RealVoiceWiring {
  store?: VoiceResourceStore;
}

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: (wiring?: RealVoiceWiring) => TPort;
}

const registration: AdapterRegistration<VoiceRecorder> = {
  port: 'voice',
  fixture: () => new FixtureVoiceRecorder(),
  real: (wiring = {}) => new WebVoiceRecorder({ store: wiring.store ?? new MemoryVoiceStore() }),
};

export default registration;
