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
  /**
   * Há um microfone aberto agora (ENG-393). Mora aqui, e não no estado da
   * estação, porque quem precisa saber está FORA dela: o "← Histórias" do
   * cabeçalho é o único caminho de saída que o palco da conversa não desenha, e
   * sair no meio de uma resposta perde a resposta.
   */
  recording: boolean;
  setRecording(recording: boolean): void;
}

export function createAppStore() {
  return createStore<AppStore>((set) => ({
    muted: false,
    toggleMuted() {
      set((s) => ({ muted: !s.muted }));
    },
    recording: false,
    setRecording(recording: boolean) {
      set({ recording });
    },
  }));
}

export const appStore = createAppStore();

export function useAppStore<T>(selector: (s: AppStore) => T): T {
  return useStore(appStore, selector);
}
