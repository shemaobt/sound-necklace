/**
 * Esqueleto do BucketSource HTTP real (PRD §5, cliente do tripod-api). Mapeia a
 * porta às superfícies de endpoint de contracts/bucket.ts com `fetch` INJETADO (sem
 * rede no CI). Os bytes do áudio viajam OPACOS (§10.5): `fetchBytes` devolve o
 * ArrayBuffer tal como veio, sem re-serializar. Os endpoints exatos são PROVISÓRIOS
 * até o OpenAPI do tripod-api (ENG-211/ENG-247).
 */

import { BucketListResponseSchema, type BucketAudio } from '../../contracts';
import type { BucketSource } from './types';

export interface HttpBucketSourceOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Token Bearer atual (do AuthProvider/ENG-239). */
  token?: () => string | null;
}

export class HttpBucketSource implements BucketSource {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #token?: () => string | null;

  constructor(opts: HttpBucketSourceOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#fetch = opts.fetch;
    this.#token = opts.token;
  }

  async list(): Promise<BucketAudio[]> {
    const res = await this.#send('GET', '/bucket/audios');
    return BucketListResponseSchema.parse(JSON.parse(await res.text())).audios;
  }

  async fetchBytes(id: string): Promise<ArrayBuffer> {
    const res = await this.#send('GET', `/bucket/audios/${encodeURIComponent(id)}/audio`);
    return res.arrayBuffer();
  }

  #send(method: string, path: string): Promise<Response> {
    const token = this.#token?.();
    return this.#fetch(this.#baseUrl + path, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  }
}
