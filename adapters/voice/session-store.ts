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
  /** A listagem da sessão, buscada uma vez e mantida em dia pelos put/delete daqui. */
  #listing: Promise<Set<string>> | null = null;

  constructor(sessions: SessionStore, sessionId: string) {
    this.#sessions = sessions;
    this.#sessionId = sessionId;
  }

  async put(path: ResourcePath, bytes: Uint8Array): Promise<void> {
    await this.#sessions.putResource(this.#sessionId, path, bytes);
    // a resposta que acabou de subir entra na listagem: buscá-la de novo custaria a
    // sessão inteira para descobrir o caminho que este método acabou de escrever
    (await this.#listing)?.add(path);
  }

  get(path: ResourcePath): Promise<Uint8Array> {
    return this.#sessions.getResource(this.#sessionId, path);
  }

  async has(path: ResourcePath): Promise<boolean> {
    return (await this.#load()).has(path);
  }

  async delete(path: ResourcePath): Promise<void> {
    await this.#sessions.deleteResource(this.#sessionId, path);
    (await this.#listing)?.delete(path);
  }

  /**
   * A rota `/resources` lista a sessão inteira e o recorte por prefixo é do cliente
   * (@/adapters/sessions/http.ts), então um `has` por pergunta custava uma listagem
   * COMPLETA por pergunta. Numa sessão de 14 cenas — ~396 perguntas — o preparo
   * pré-revisão disparava ~396 requisições, cada uma devolvendo a lista inteira.
   *
   * A PROMESSA é guardada, não o resultado: o preparo consulta todos os caminhos com
   * `Promise.all`, então guardar só depois de resolver deixaria as 396 chamadas
   * partirem juntas antes de a primeira voltar, e não teria economizado nada.
   */
  #load(): Promise<Set<string>> {
    this.#listing ??= this.#sessions
      .listResources(this.#sessionId, '')
      .then((paths) => new Set<string>(paths));
    return this.#listing;
  }
}
