/**
 * Auto-registro do adapter de áudio (docs/architecture.md §4): o composition
 * root (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e
 * resolve portas por nome — fixture é o default; o modo real liga por
 * configuração de ambiente (ENG-247).
 */

import { FixtureAudioEngine } from './fixture';
import type { AudioEngine } from './types';
import { WebAudioEngine } from './web-audio';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<AudioEngine> = {
  port: 'audio',
  fixture: () => new FixtureAudioEngine(),
  real: () => new WebAudioEngine(),
};

export default registration;
