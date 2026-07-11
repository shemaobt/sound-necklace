/**
 * SessionStore app-global do composition root (ENG-270/272): UM singleton fixture
 * partilhado por Setup, Dashboard e Export — a sessão criada num aparece nos outros
 * (§7.2). O backend persiste num `KeyValueStorage` (localStorage) para sobreviver ao
 * reload e alimentar a reidratação de `/session/:id` (§7.3). A seleção do modo real
 * por ambiente é ENG-247.
 */

import {
  FixtureSessionBackend,
  FixtureSessionStore,
  type KeyValueStorage,
  type SessionStore,
} from '../../adapters/sessions';

/** localStorage do browser quando disponível; ausente em contextos sem Web Storage. */
function browserStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Backend persistido, tolerante a localStorage corrompido: o backend hidrata (JSON.parse)
 * na construção, então um blob inválido — escrita interrompida, shape antigo, adulteração —
 * derrubaria o shell inteiro (o composition root chama `appSessionStore()` em toda rota de
 * sessão). O guard cai para em memória nesta sessão em vez de travar o boot (a hidratação
 * defensiva no próprio adapter é follow-up ENG-240).
 */
function persistentBackend(): FixtureSessionBackend {
  try {
    return new FixtureSessionBackend(browserStorage());
  } catch {
    return new FixtureSessionBackend();
  }
}

let store: SessionStore | undefined;

export function appSessionStore(): SessionStore {
  return (store ??= new FixtureSessionStore({ backend: persistentBackend() }));
}
