/**
 * Dados de fixture do bucket do projeto (§7.4) consumidos pela FixtureBucketSource.
 *
 * Cada entrada = um `BucketAudio` (metadados que a Setup lista) + um `PcmSpec`: o
 * áudio sintético determinístico do harness (tests/golden/pcm.ts). Os BYTES que
 * `fetchBytes` devolve em modo fixture são esse PcmSpec como JSON — o formato que o
 * FixtureAudioEngine decodifica (LCG bit-idêntico Node/Chromium), então o fluxo
 * fixture Setup→decode→grade→hash roda ponta a ponta sem rede nem WAV real.
 *
 * `duration_sec` casa com `samples / sampleRate` de propósito, para os metadados
 * anunciados baterem com a duração decodificada. As três entradas cobrem os dois
 * eixos que a Setup exercita (§6.1, §12/O6): consentimento presente/ausente e
 * acousteme presente/nulo, além de mono e multicanal. Áudio 100% sintético — nunca
 * comitar voz real de comunidade aqui (LGPD, PRD §12).
 *
 * O `acousteme` carrega a grade uniforme do tokenizador (hop 20 ms, presets 10/25/50
 * frames, §6.1/O8 — tripod-api PR #100); só o GranularityResolver o lê.
 */

import type { BucketAudio } from '../../contracts';
import type { PcmSpec } from '../../tests/golden/pcm';

export interface BucketFixtureEntry {
  audio: BucketAudio;
  pcm: PcmSpec;
}

export const BUCKET_FIXTURE_AUDIOS: BucketFixtureEntry[] = [
  {
    audio: {
      id: 'aud_conto_do_boto',
      filename: 'conto-do-boto.wav',
      duration_sec: 3,
      consent_present: true,
      acousteme: {
        codebook_version: 'terena-xlsr53-k100-v1',
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    pcm: { seed: 101, sampleRate: 8000, samples: 24000, channels: 1 },
  },
  // Áudio dedicado do roteiro E2E (tests/e2e/support/app.ts SCENARIO): 6 s a 8 kHz →
  // Média (25 frames × 20 ms = 0.5 s) resolve para uma grade de 12 contas (índices
  // 0–11), a grade que o ColarApp roteiriza. Separado do `conto-do-boto` (3 s) para
  // não acoplar a duração do roteiro àquele áudio, que outros testes reutilizam.
  {
    audio: {
      id: 'aud_roteiro_e2e',
      filename: 'jornada-do-boto.wav',
      duration_sec: 6,
      consent_present: true,
      acousteme: {
        codebook_version: 'terena-xlsr53-k100-v1',
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    pcm: { seed: 606, sampleRate: 8000, samples: 48000, channels: 1 },
  },
  {
    audio: {
      id: 'aud_vitoria_regia',
      filename: 'lenda-da-vitoria-regia.wav',
      duration_sec: 4,
      consent_present: true,
      acousteme: {
        codebook_version: 'terena-xlsr53-k100-v1',
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    pcm: { seed: 202, sampleRate: 8000, samples: 32000, channels: 2 },
  },
  {
    audio: {
      id: 'aud_gravacao_sem_acousteme',
      filename: 'gravacao-antiga.wav',
      duration_sec: 2.5,
      consent_present: false,
      acousteme: null,
    },
    pcm: { seed: 303, sampleRate: 8000, samples: 20000, channels: 1 },
  },
  // Espelham os casos golden `minimal-flow` e `seam-small-move` (mesmo PcmSpec do
  // caso → mesmo manifest_id), para a ENG-253 dirigir a UI real e provar identidade
  // byte a byte do export contra tests/golden/expected/*. A granularidade Média (25
  // frames × 20 ms) resolve para o beadSec 0.5 dos casos (grade de 24 contas em 12 s).
  {
    audio: {
      id: 'aud_fluxo_minimo',
      filename: 'fluxo-minimo.wav',
      duration_sec: 12,
      consent_present: true,
      acousteme: {
        codebook_version: 'terena-xlsr53-k100-v1',
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    pcm: { seed: 12345, sampleRate: 8000, samples: 96000, channels: 1 },
  },
  {
    audio: {
      id: 'aud_costura_pequena',
      filename: 'costura-pequena.wav',
      duration_sec: 12,
      consent_present: true,
      acousteme: {
        codebook_version: 'terena-xlsr53-k100-v1',
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    pcm: { seed: 404, sampleRate: 8000, samples: 96000, channels: 1 },
  },
];
