/**
 * Resolução default das portas do Setup (§8.1). Singletons de MÓDULO em modo
 * fixture headless: bucket (§7.4), resolver de granularidade (regra O8, §6.1),
 * engine de áudio (decode/hash). A SessionStore é o singleton app-global partilhado
 * com Dashboard/Export (ENG-272), para a sessão criada aqui aparecer nas outras
 * telas; a seleção do modo real por ambiente é ENG-247.
 *
 * Nos testes a página recebe as portas por prop — estes defaults só valem em
 * produção, então ficam sem cobertura de teste de propósito.
 */

import { FixtureAudioEngine, type AudioEngine } from '../../../adapters/audio';
import { FixtureBucketSource, type BucketSource } from '../../../adapters/bucket';
import {
  AcoustemeGranularityResolver,
  type GranularityResolver,
} from '../../../adapters/granularity';
import type { SessionStore } from '../../../adapters/sessions';
import { appSessionStore } from '../../app/session-adapter';

let bucket: BucketSource | undefined;
export function defaultBucket(): BucketSource {
  return (bucket ??= new FixtureBucketSource());
}

let resolver: GranularityResolver | undefined;
export function defaultResolver(): GranularityResolver {
  return (resolver ??= new AcoustemeGranularityResolver());
}

let audioEngine: AudioEngine | undefined;
export function defaultAudioEngine(): AudioEngine {
  return (audioEngine ??= new FixtureAudioEngine());
}

export function defaultSessionStore(): SessionStore {
  return appSessionStore();
}
