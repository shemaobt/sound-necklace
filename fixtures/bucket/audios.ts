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
        version: 1,
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    pcm: { seed: 101, sampleRate: 8000, samples: 24000, channels: 1 },
  },
  {
    audio: {
      id: 'aud_vitoria_regia',
      filename: 'lenda-da-vitoria-regia.wav',
      duration_sec: 4,
      consent_present: true,
      acousteme: {
        version: 1,
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
        version: 1,
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
        version: 1,
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    pcm: { seed: 404, sampleRate: 8000, samples: 96000, channels: 1 },
  },
];
