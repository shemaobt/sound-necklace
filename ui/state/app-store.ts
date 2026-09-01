import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

/**
 * Estado de UI global do app (fora de qualquer sessão): o toggle de som do
 * cabeçalho que silencia todo som da UI (PRD §9, §13). Separado do session store
 * porque sobrevive à troca de sessão e não entra em nenhum artefato.
 */
export interface AppStore {
  muted: boolean;
  toggleMuted(): void;
}

export function createAppStore() {
  return createStore<AppStore>((set) => ({
    muted: false,
    toggleMuted() {
      set((s) => ({ muted: !s.muted }));
    },
  }));
}

export const appStore = createAppStore();

export function useAppStore<T>(selector: (s: AppStore) => T): T {
  return useStore(appStore, selector);
}
