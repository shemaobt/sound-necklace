/**
 * Granularidade do projeto app-global (ENG-352): UM singleton mode-aware partilhado
 * pelo Setup e pela tela de configuração — as duas precisam ver a MESMA decisão, e
 * na fixture "a mesma" só existe se for a mesma instância.
 *
 * No modo real fala com `/sound-necklace/projects/{id}/settings` (ENG-361), com o
 * Bearer do AuthProvider; na fixture, o store em memória — teste/CI seguem sem rede.
 */

import { FixtureProjectSettings, type ProjectSettingsStore } from '../../adapters/project-settings';
import registration from '../../adapters/project-settings/register';
import { API_BASE_URL, API_MODE } from './api-config';
import { appAuth } from './auth-adapter';

let store: ProjectSettingsStore | undefined;

export function appProjectSettings(): ProjectSettingsStore {
  return (store ??=
    API_MODE === 'real'
      ? registration.real({
          baseUrl: API_BASE_URL,
          fetch: globalThis.fetch.bind(globalThis),
          token: () => appAuth().token(),
        })
      : registration.fixture());
}

/** Só para teste: derruba o singleton entre casos. */
export function resetProjectSettingsForTest(next?: FixtureProjectSettings): void {
  store = next;
}
