import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

/**
 * As duas pontas do progresso da história que o shell não enxerga (ENG-648).
 *
 * A barra do topo mede a história inteira, e quatro das seis etapas se leem
 * direto do `SessionState`. As outras duas não: o quanto já se OUVIU na Escuta 1
 * e quantos artefatos já se BAIXOU na Guardar são fatos da tela, não do domínio —
 * não entram em artefato nenhum, não são decisão de ninguém, e o PRD não os
 * guarda. Ficam aqui, em memória, ao lado do `appStore`, e morrem com a aba.
 *
 * Os dois só CRESCEM (`Math.max`): a barra da história inteira não anda para
 * trás porque a reprodução voltou ao começo, e um download é um fato consumado.
 * O `reset()` é por sessão — quem o chama é o shell, ao montar a sessão aberta.
 */
export interface ProgressStore {
  /** Contas distintas da história já percorridas pela reprodução na Escuta 1. */
  heardBeads: number;
  /** Artefatos já baixados nesta sessão (0–3). */
  artifactsDownloaded: number;
  noteHeard(beads: number): void;
  noteDownloaded(count: number): void;
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
    artifactsDownloaded: 0,
    noteHeard(beads) {
      set((s) => ({ heardBeads: grow(s.heardBeads, beads) }));
    },
    noteDownloaded(count) {
      set((s) => ({ artifactsDownloaded: grow(s.artifactsDownloaded, count) }));
    },
    reset() {
      set({ heardBeads: 0, artifactsDownloaded: 0 });
    },
  }));
}

export const progressStore = createProgressStore();

export function useProgressStore<T>(selector: (s: ProgressStore) => T): T {
  return useStore(progressStore, selector);
}
