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

import { FixtureAudioEngine, WebAudioEngine, type AudioEngine } from '../../../adapters/audio';
import type { BucketSource } from '../../../adapters/bucket';
import {
  AcoustemeGranularityResolver,
  type GranularityResolver,
} from '../../../adapters/granularity';
import type { SessionStore } from '../../../adapters/sessions';
import { API_MODE } from '../../app/api-config';
import { appBucket, resolveProjectId } from '../../app/bucket-adapter';
import { appSessionStore } from '../../app/session-adapter';

export function defaultBucket(): BucketSource {
  return appBucket();
}

let resolver: GranularityResolver | undefined;
export function defaultResolver(): GranularityResolver {
  return (resolver ??= new AcoustemeGranularityResolver());
}

let audioEngine: AudioEngine | undefined;
export function defaultAudioEngine(): AudioEngine {
  // real: decodeAudioData decodifica o áudio do piloto (mp3/wav) e o hash/grade saem
  // do PCM verdadeiro; fixture: o PcmSpec sintético de sempre
  return (audioEngine ??= API_MODE === 'real' ? new WebAudioEngine() : new FixtureAudioEngine());
}

export function defaultSessionStore(): SessionStore {
  return appSessionStore();
}

/**
 * Projeto dono da sessão nova (§8.1): no modo real vem de `my-project-roles` (o
 * mesmo cache do bucket — o projeto cujos áudios o Setup lista é o projeto da
 * sessão); na fixture, o id sintético de sempre.
 */
export function defaultProjectId(): Promise<string> {
  return API_MODE === 'real' ? resolveProjectId() : Promise.resolve('projeto');
}
