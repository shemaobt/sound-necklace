/**
 * Resolução default das portas do Setup (§8.1). Singletons de MÓDULO em modo
 * fixture headless: bucket (§7.4), resolver de granularidade (stub O8, §6.1),
 * engine de áudio (decode/hash) e SessionStore. A seleção do modo real por ambiente
 * e a store app-global partilhada com o Dashboard são wiring do composition root
 * (ENG-247/follow-up do shell), fora do escopo aqui.
 *
 * Nos testes a página recebe as portas por prop — estes defaults só valem em
 * produção, então ficam sem cobertura de teste de propósito.
 */

import { FixtureAudioEngine, type AudioEngine } from '../../../adapters/audio';
import { FixtureBucketSource, type BucketSource } from '../../../adapters/bucket';
import { StubGranularityResolver, type GranularityResolver } from '../../../adapters/granularity';
import { FixtureSessionStore, type SessionStore } from '../../../adapters/sessions';

let bucket: BucketSource | undefined;
export function defaultBucket(): BucketSource {
  return (bucket ??= new FixtureBucketSource());
}

let resolver: GranularityResolver | undefined;
export function defaultResolver(): GranularityResolver {
  return (resolver ??= new StubGranularityResolver());
}

let audioEngine: AudioEngine | undefined;
export function defaultAudioEngine(): AudioEngine {
  return (audioEngine ??= new FixtureAudioEngine());
}

let store: SessionStore | undefined;
export function defaultSessionStore(): SessionStore {
  return (store ??= new FixtureSessionStore());
}
