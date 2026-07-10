/**
 * VoiceResourceStore em memória — default do fixture e alvo determinístico dos
 * testes. Guarda cada gravação por caminho; `put` sobrescreve (re-gravar
 * substitui). Cópias defensivas na entrada/saída (bytes opacos, §10.5).
 */

import type { ResourcePath } from '../../contracts';

import type { VoiceResourceStore } from './types';

export class MemoryVoiceStore implements VoiceResourceStore {
  readonly #files = new Map<string, Uint8Array>();

  async put(path: ResourcePath, bytes: Uint8Array): Promise<void> {
    this.#files.set(path, bytes.slice());
  }

  async get(path: ResourcePath): Promise<Uint8Array> {
    const bytes = this.#files.get(path);
    if (!bytes) throw new Error(`recurso ausente: ${path}`);
    return bytes.slice();
  }

  async has(path: ResourcePath): Promise<boolean> {
    return this.#files.has(path);
  }

  async delete(path: ResourcePath): Promise<void> {
    this.#files.delete(path);
  }
}
