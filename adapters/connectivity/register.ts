/**
 * Auto-registro do adapter de conectividade (docs/architecture.md §4): o
 * composition root (ENG-224) colhe todos os adapters/*\/register.ts via
 * import.meta.glob e resolve portas por nome — fixture é o default; o modo real
 * liga por configuração de ambiente (ENG-247).
 */

import { BrowserConnectivityMonitor } from './browser';
import { FixtureConnectivityMonitor } from './fixture';
import type { ConnectivityMonitor } from './types';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<ConnectivityMonitor> = {
  port: 'connectivity',
  fixture: () => new FixtureConnectivityMonitor(),
  real: () => new BrowserConnectivityMonitor(),
};

export default registration;
