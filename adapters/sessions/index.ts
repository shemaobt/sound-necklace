/**
 * Superfície pública do adapter de sessões (ENG-240). O app resolve a store pela
 * porta 'sessions' do register.ts; estes exports servem a testes e à camada de
 * wiring (ui/pages/setup, dashboard, export).
 */

export {
  SessionNotFoundError,
  type CreateSessionInput,
  type LockHolder,
  type SessionStore,
  type Unsubscribe,
} from './types';
export { createAutosaver, type Autosaver, type AutosaverOptions } from './autosave';
export {
  DEFAULT_FIXTURE_USER,
  FixtureSessionBackend,
  FixtureSessionStore,
  type FixtureSessionStoreOptions,
  type KeyValueStorage,
} from './fixture';
export { HttpSessionStore, type HttpSessionStoreOptions } from './http';
