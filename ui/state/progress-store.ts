import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

/**
 * A ponta do progresso da história que o shell não enxerga (ENG-648).
 *
 * A barra do topo mede a história inteira, e três das quatro etapas se leem
 * direto do `SessionState`. A outra não: o quanto já se OUVIU na Escuta 1 é fato
 * da tela, não do domínio — não entra em artefato nenhum, não é decisão de
 * ninguém, e o PRD não o guarda. Fica aqui, em memória, ao lado do `appStore`, e
 * morre com a aba.
 *
 * Só CRESCE (`Math.max`): a barra da história inteira não anda para trás porque a
 * reprodução voltou ao começo. O `reset()` é por sessão — quem o chama é o shell,
 * ao montar a sessão aberta.
 */
export interface ProgressStore {
  /** Contas distintas da história já percorridas pela reprodução na Escuta 1. */
  heardBeads: number;
  noteHeard(beads: number): void;
  reset(): void;
}

/** Descarta lixo e nunca deixa o valor encolher. */
function grow(current: number, incoming: number): number {
  if (!Number.isFinite(incoming)) return current;
  return Math.max(current, Math.max(0, Math.floor(incoming)));
}

export function createProgressStore() {
  return createStore<ProgressStore>((set) => ({
    heardBeads: 0,
    noteHeard(beads) {
      set((s) => ({ heardBeads: grow(s.heardBeads, beads) }));
    },
    reset() {
      set({ heardBeads: 0 });
    },
  }));
}

export const progressStore = createProgressStore();

export function useProgressStore<T>(selector: (s: ProgressStore) => T): T {
  return useStore(progressStore, selector);
}
