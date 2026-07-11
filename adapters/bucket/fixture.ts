/**
 * Modo fixture do BucketSource (default) — roda headless, sem rede. A listagem e os
 * bytes de áudio vêm de fixtures/bucket/audios.ts: os bytes de `fetchBytes` são o
 * PcmSpec como JSON, exatamente o que o FixtureAudioEngine.decode consome, então o
 * fluxo fixture Setup→decode→grade→hash fecha sem WAV real. Custódia opaca: a
 * listagem sai por clone para não vazar a referência interna.
 */

import type { BucketAudio } from '../../contracts';
import { BUCKET_FIXTURE_AUDIOS, type BucketFixtureEntry } from '../../fixtures/bucket/audios';
import type { BucketSource } from './types';
import { BucketAudioNotFoundError } from './types';

export class FixtureBucketSource implements BucketSource {
  readonly #entries: BucketFixtureEntry[];

  constructor(entries: BucketFixtureEntry[] = BUCKET_FIXTURE_AUDIOS) {
    this.#entries = entries;
  }

  async list(): Promise<BucketAudio[]> {
    return this.#entries.map((e) => structuredClone(e.audio));
  }

  async fetchBytes(id: string): Promise<ArrayBuffer> {
    const entry = this.#entries.find((e) => e.audio.id === id);
    if (!entry) throw new BucketAudioNotFoundError(id);
    return new TextEncoder().encode(JSON.stringify(entry.pcm)).buffer as ArrayBuffer;
  }
}
