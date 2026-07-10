/**
 * Auto-registro do adapter de sessões (docs/architecture.md §4): o composition
 * root (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e
 * resolve portas por nome — fixture é o default; o modo real liga por configuração
 * de ambiente (ENG-247, que fornece baseUrl/token/usuário reais).
 */

import { BrowserConnectivityMonitor } from '../connectivity/browser';
import { DEFAULT_FIXTURE_USER, FixtureSessionStore } from './fixture';
import { HttpSessionStore } from './http';
import type { SessionStore } from './types';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<SessionStore> = {
  port: 'sessions',
  fixture: () => new FixtureSessionStore(),
  // baseUrl/token/usuário reais são injetados pelo wiring (ENG-247); o esqueleto
  // aponta para um baseUrl relativo e usa o fetch/conectividade do browser.
  real: () =>
    new HttpSessionStore({
      baseUrl: '/api',
      fetch: globalThis.fetch.bind(globalThis),
      monitor: new BrowserConnectivityMonitor(),
      user: DEFAULT_FIXTURE_USER,
    }),
};

export default registration;
