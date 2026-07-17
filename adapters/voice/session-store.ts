/**
 * VoiceResourceStore sobre os recursos da SESSÃO (§10.4/O5): a persistência real
 * das respostas de voz é a rota `/resources` do SessionStore — o namespace por
 * sessão é do servidor (`sound-necklace/{session_id}/respostas/…`), e um reload
 * reencontra as gravações. É a ligação que o register.ts prometia (ENG-247).
 */

import type { ResourcePath } from '../../contracts';
import type { SessionStore } from '../sessions';
import type { VoiceResourceStore } from './types';

export class SessionVoiceStore implements VoiceResourceStore {
  readonly #sessions: SessionStore;
  readonly #sessionId: string;

  constructor(sessions: SessionStore, sessionId: string) {
    this.#sessions = sessions;
    this.#sessionId = sessionId;
  }

  put(path: ResourcePath, bytes: Uint8Array): Promise<void> {
    return this.#sessions.putResource(this.#sessionId, path, bytes);
  }

  get(path: ResourcePath): Promise<Uint8Array> {
    return this.#sessions.getResource(this.#sessionId, path);
  }

  async has(path: ResourcePath): Promise<boolean> {
    // ponytail: um GET /resources por pergunta consultada; se pesar no Mapeamento,
    // cachear a listagem por instância.
    const found = await this.#sessions.listResources(this.#sessionId, path);
    return found.includes(path);
  }

  delete(path: ResourcePath): Promise<void> {
    return this.#sessions.deleteResource(this.#sessionId, path);
  }
}
