/**
 * ui/state — ponte do estado de domínio para as telas (docs/architecture.md §2).
 * Importa domain/ (tipos + reducers) e o zustand; nunca adapters (o autosave
 * chega como porta injetada). Pages/templates/app consomem estes hooks/stores.
 */
export {
  createSessionStore,
  sessionStore,
  useSessionStore,
  type EditorLock,
  type SessionStore,
  type SessionStoreDeps,
} from './session-store';
export { createAppStore, appStore, useAppStore, type AppStore } from './app-store';
