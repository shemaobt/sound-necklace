/**
 * AuthProvider app-global (§7.1): UM singleton partilhado por Login, Dashboard e a
 * raiz de sessão — o mesmo token que o Login emite é o que a expiração invalida,
 * venha o gatilho do Dashboard ou de dentro de `/session/:id`. Sem este singleton
 * único, expirar mid-Triage não teria a quem avisar.
 *
 * A seleção do modo (ENG-247) é por ambiente: `VITE_API_MODE=real` monta o
 * HttpAuthProvider contra `VITE_API_BASE_URL` (login por e-mail, papéis via
 * my-roles); o default é a fixture, que mantém teste/CI sem rede.
 */

import { FixtureAuthProvider, HttpAuthProvider } from '../../adapters/api';
import { API_BASE_URL, API_MODE } from './api-config';

let auth: FixtureAuthProvider | HttpAuthProvider | undefined;
let ready: Promise<void> | undefined;

/**
 * A retomada da sessão em VOO ÚNICO (ENG-247): quem depende de token espera aqui
 * antes de ler `appAuth().token()`. Sem isto, um reload dispara chamadas 401
 * enquanto o refresh persistido ainda está virando sessão (corrida real: o Setup
 * lista o bucket antes de o resume terminar).
 */
export function authReady(): Promise<void> {
  return (ready ??= appAuth()
    .resume()
    .then(() => undefined)
    .catch(() => undefined));
}

export function appAuth(): FixtureAuthProvider | HttpAuthProvider {
  return (auth ??=
    API_MODE === 'real'
      ? new HttpAuthProvider({
          baseUrl: API_BASE_URL,
          fetch: globalThis.fetch.bind(globalThis),
          // §12 emendado (decisão do dono): o refresh rotativo persiste para a
          // sessão sobreviver a reload/reabertura; o access segue só em memória
          ...(typeof localStorage !== 'undefined' ? { storage: localStorage } : {}),
        })
      : new FixtureAuthProvider());
}
