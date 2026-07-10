/**
 * Auto-registro do adapter de auth (docs/architecture.md §4): o composition root
 * (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e resolve
 * portas por nome — fixture é o default; o modo real liga por configuração de
 * ambiente (ENG-247, que injeta baseUrl/refresh reais).
 *
 * A porta resolvida pelo app é `auth` (o `AuthProvider`, de onde os demais adapters
 * puxam o token). `ApiClient` é o wrapper de transporte que os adapters reais
 * constroem por dentro — não é uma porta resolvida separadamente.
 */

import { HttpAuthProvider } from './client';
import { FixtureAuthProvider } from './fixture';
import type { AuthProvider } from './types';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<AuthProvider> = {
  port: 'auth',
  fixture: () => new FixtureAuthProvider(),
  real: () => new HttpAuthProvider({ baseUrl: '/api', fetch: globalThis.fetch.bind(globalThis) }),
};

export default registration;
