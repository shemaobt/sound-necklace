/**
 * SessionStore app-global do composition root (ENG-270/272): UM singleton mode-aware
 * partilhado por Setup, Dashboard e Export — a sessão criada num aparece nos outros
 * (§7.2).
 *
 * Fixture (default de teste/CI): persiste num `KeyValueStorage` (localStorage) para
 * sobreviver ao reload. Real (ENG-247): o `HttpSessionStore` contra o tripod-api,
 * com o Bearer vivo do AuthProvider atrás de `authReady()` — TODA chamada de sessão
 * espera a retomada do boot assentar (§12 emendado), então um reload em
 * `/session/:id` não dispara 401 de corrida. O `onLockLost` fecha o circuito do
 * fencing (§7.3): um autosave recusado com SESSION_LOCKED põe a sessão em revisão
 * com o nome de quem a tomou — o autosave é fire-and-forget e esta é a única via.
 */

import {
  FixtureSessionBackend,
  FixtureSessionStore,
  HttpSessionStore,
  type KeyValueStorage,
  type SessionStore,
} from '../../adapters/sessions';
import { BrowserConnectivityMonitor } from '../../adapters/connectivity/browser';
import { sessionStore } from '../state';
import { API_BASE_URL, API_MODE } from './api-config';
import { appAuth, authReady } from './auth-adapter';
import { matchRoute } from './router';

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

let backend: FixtureSessionBackend | undefined;

/**
 * O "servidor" fixture partilhado por baixo do store app-global. Exposto para o seam
 * de teste (§7.3): uma segunda store sobre o MESMO backend é um segundo usuário no
 * mesmo servidor — é o que permite semear a trava consultiva por outra pessoa sem
 * dois contextos de browser com localStorage separado.
 */
export function appSessionBackend(): FixtureSessionBackend {
  return (backend ??= persistentBackend());
}

let store: SessionStore | undefined;

export function appSessionStore(): SessionStore {
  return (store ??=
    API_MODE === 'real'
      ? new HttpSessionStore({
          baseUrl: API_BASE_URL,
          fetch: globalThis.fetch.bind(globalThis),
          monitor: new BrowserConnectivityMonitor(),
          // o editor só é conhecido depois do login — thunk, avaliado por acesso
          user: () => {
            const u = appAuth().currentUser();
            return u
              ? { user_id: u.id, display_name: u.username }
              : { user_id: 'anon', display_name: '—' };
          },
          token: async () => {
            await authReady();
            return appAuth().token();
          },
          onLockLost: (id, holder) => {
            // O veredito é POR SESSÃO: um flush atrasado da sessão anterior (409 na
            // janela da troca A→B) não pode travar a sessão recém-aberta.
            const route = matchRoute(window.location.pathname);
            if (route.name === 'session' && route.id === id)
              sessionStore.getState().setLock({ holder });
          },
        })
      : new FixtureSessionStore({ backend: appSessionBackend() }));
}
