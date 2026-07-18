/**
 * BucketSource real sobre o tripod-api (ENG-247). A listagem é POR PROJETO
 * (`/sound-necklace/projects/{id}/audios` — áudios do piloto com envelope de
 * acousteme + flag de consentimento, ENG-261) e os bytes vêm em DOIS saltos: a API
 * minta uma URL assinada de curta duração (`/sound-necklace/audios/{id}/url`) e o
 * áudio sai do storage por ela — a API nunca serve os bytes (§10.5, custódia opaca).
 *
 * O 2º salto vai SEM Bearer: uma URL assinada autentica pela assinatura na query, e
 * um header Authorization extra faria o storage rejeitar a requisição.
 */

import {
  AudioUrlResponseSchema,
  BucketListResponseSchema,
  type BucketAudio,
} from '../../contracts';
import type { BucketSource } from './types';
import { BucketAudioNotFoundError } from './types';

export interface HttpBucketSourceOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Projeto dono do bucket (§7.4) — resolvido pelo wiring (my-project-roles). */
  projectId: () => string | Promise<string>;
  /** Token Bearer atual (do AuthProvider/ENG-239). */
  token?: () => string | null;
}

export class HttpBucketSource implements BucketSource {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #projectId: () => string | Promise<string>;
  readonly #token?: () => string | null;

  constructor(opts: HttpBucketSourceOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#fetch = opts.fetch;
    this.#projectId = opts.projectId;
    this.#token = opts.token;
  }

  async list(): Promise<BucketAudio[]> {
    const projectId = await this.#projectId();
    const res = await this.#send(
      `/sound-necklace/projects/${encodeURIComponent(projectId)}/audios`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} na listagem do bucket`);
    return BucketListResponseSchema.parse(await res.json()).audios;
  }

  async fetchBytes(id: string): Promise<ArrayBuffer> {
    const res = await this.#send(`/sound-necklace/audios/${encodeURIComponent(id)}/url`);
    if (res.status === 404) throw new BucketAudioNotFoundError(id);
    if (!res.ok) throw new Error(`HTTP ${res.status} ao assinar o áudio ${id}`);
    const { url } = AudioUrlResponseSchema.parse(await res.json());

    const audio = await this.#fetch(url);
    if (!audio.ok) throw new Error(`HTTP ${audio.status} ao baixar o áudio ${id}`);
    return audio.arrayBuffer();
  }

  #send(path: string): Promise<Response> {
    const token = this.#token?.();
    return this.#fetch(this.#baseUrl + path, {
      method: 'GET',
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  }
}
