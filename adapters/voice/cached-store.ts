/**
 * Cache local dos bytes das respostas, sobre qualquer `VoiceResourceStore`.
 *
 * O `WebVoiceRecorder` já mantém um `#warm` em memória (ENG-339), e ele resolve a
 * sessão enquanto a aba vive. O que ele não atravessa é o reload: reabrir uma sessão
 * partia de cache frio, e o preparo pré-revisão baixava as 41 respostas de novo a cada
 * entrada na revisão. Este decorador é a camada abaixo do `#warm` — persistente, e é o
 * que faz a segunda visita não custar rede.
 *
 * O `put` também aquece, e isso fecha um furo mais antigo: os bytes acabavam de sair do
 * microfone e eram descartados, então tocar a resposta logo depois de gravá-la baixava
 * do servidor o que estava na mão.
 *
 * O cache é CONVENIÊNCIA, nunca condição. Aba anônima, cota estourada, IndexedDB
 * bloqueado por política — em qualquer desses a resposta ainda tem de tocar, então toda
 * falha do cache é engolida e o armazém de baixo responde. É também por isso que `has`
 * nunca é respondido daqui: o servidor é quem sabe o que existe, e uma resposta gravada
 * noutro aparelho sumiria da revisão se o cache tivesse voz nessa pergunta.
 */

import type { ResourcePath } from '../../contracts';

import type { VoiceResourceStore } from './types';

/** O armazenamento por baixo do cache. `clearSession` devolve o espaço de uma sessão. */
export interface AudioCache {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  clearSession(sessionId: string): Promise<void>;
}

export class CachedVoiceStore implements VoiceResourceStore {
  readonly #inner: VoiceResourceStore;
  readonly #cache: AudioCache;
  readonly #sessionId: string;

  constructor(inner: VoiceResourceStore, cache: AudioCache, sessionId: string) {
    this.#inner = inner;
    this.#cache = cache;
    this.#sessionId = sessionId;
  }

  // o caminho `respostas/…` é relativo à sessão (§10.4/O5): sem o prefixo, a mesma
  // pergunta de duas sessões colapsaria na MESMA gravação
  #key(path: ResourcePath): string {
    return `${this.#sessionId}/${path}`;
  }

  async put(path: ResourcePath, bytes: Uint8Array): Promise<void> {
    await this.#inner.put(path, bytes);
    await this.#cache.put(this.#key(path), bytes).catch(() => undefined);
  }

  async get(path: ResourcePath): Promise<Uint8Array> {
    const hit = await this.#cache.get(this.#key(path)).catch(() => null);
    if (hit) return hit;
    const bytes = await this.#inner.get(path);
    await this.#cache.put(this.#key(path), bytes).catch(() => undefined);
    return bytes;
  }

  has(path: ResourcePath): Promise<boolean> {
    return this.#inner.has(path);
  }

  async delete(path: ResourcePath): Promise<void> {
    await this.#inner.delete(path);
    await this.#cache.delete(this.#key(path)).catch(() => undefined);
  }

  /** Devolve o espaço desta sessão. Chamado quando ela é concluída. */
  async forget(): Promise<void> {
    await this.#cache.clearSession(this.#sessionId).catch(() => undefined);
  }
}
