/**
 * Auto-registro do adapter de voz (docs/architecture.md §4): o composition root
 * (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e resolve
 * portas por nome — fixture é o default; o modo real liga por configuração de
 * ambiente (ENG-247).
 *
 * Ambos os modos nascem com um MemoryVoiceStore. A estação Conversa (ENG-249)
 * liga o recorder aos recursos da SESSÃO ATIVA do SessionStore (§10.4/O5) — como
 * o SessionStore ainda não expõe delete de recurso, essa ligação é um follow-up.
 */

import { FixtureVoiceRecorder } from './fixture';
import { MemoryVoiceStore } from './memory-store';
import type { VoiceRecorder } from './types';
import { WebVoiceRecorder } from './web';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<VoiceRecorder> = {
  port: 'voice',
  fixture: () => new FixtureVoiceRecorder(),
  real: () => new WebVoiceRecorder({ store: new MemoryVoiceStore() }),
};

export default registration;
