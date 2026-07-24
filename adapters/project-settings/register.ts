/**
 * Registro do adapter de granularidade do projeto (ENG-352). O modo real fala com as
 * rotas de settings do tripod-api (ENG-361); o fixture roda o fluxo inteiro sem
 * backend. baseUrl/token reais chegam pelo wiring do composition root (ENG-247); sem
 * wiring, vale o esqueleto — baseUrl relativo + fetch do browser.
 *
 * A fixture abre com o projeto do modo fixture já configurado em `medium`: sem isso a
 * primeira tela seria "ninguém decidiu ainda" e o Setup do demo não criaria sessão.
 */

import { FixtureProjectSettings } from './fixture';
import { HttpProjectSettings, type HttpProjectSettingsOptions } from './http';
import type { ProjectSettingsStore } from './types';

/** O projeto sintético do modo fixture (o mesmo de `ui/pages/setup/ports.ts`). */
const FIXTURE_PROJECT_ID = 'projeto';

export type RealProjectSettingsWiring = Partial<HttpProjectSettingsOptions>;

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: (wiring?: RealProjectSettingsWiring) => TPort;
}

const registration: AdapterRegistration<ProjectSettingsStore> = {
  port: 'project-settings',
  fixture: () =>
    new FixtureProjectSettings({ seed: { [FIXTURE_PROJECT_ID]: { level: 'medium' } } }),
  real: (wiring = {}) =>
    new HttpProjectSettings({
      baseUrl: wiring.baseUrl ?? '/api',
      fetch: wiring.fetch ?? globalThis.fetch.bind(globalThis),
      token: wiring.token,
    }),
};

export default registration;
