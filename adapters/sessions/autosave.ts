/**
 * Autosaver — o mecanismo de autosave do §7.3, reusado pela fixture e pelo HTTP
 * real: debounce (agrupa rajadas), coalescing (o último estado por sessão vence),
 * retry com backoff exponencial em falha transitória, e PAUSA enquanto offline
 * (o estado fica em memória; ao voltar a conexão, faz flush do pendente — nada se
 * perde). O alvo de persistência é injetado (`persist`); a conectividade vem da
 * porta ConnectivityMonitor (§13).
 */

import type { SessionStateDto } from '../../contracts';
import type { ConnectivityMonitor } from '../connectivity/types';

export interface AutosaverOptions {
  /** Escreve o estado no armazenamento (fixture ou PUT real). Pode falhar (retry). */
  persist: (id: string, state: SessionStateDto) => Promise<void>;
  monitor: ConnectivityMonitor;
  /** Janela de debounce (ms). */
  debounceMs?: number;
  /** Tentativas máximas por escrita antes de re-enfileirar o pendente. */
  maxRetries?: number;
  /** Backoff base (ms), dobrado a cada tentativa. */
  backoffMs?: number;
}

export interface Autosaver {
  /** Enfileira o estado para persistir (debounced/coalescente/pausável). */
  schedule(id: string, state: SessionStateDto): void;
  /** Persiste o pendente desta sessão já (com retry). No-op se offline. */
  flush(id: string): Promise<void>;
  /** Cancela o timer e para de observar a conectividade. */
  dispose(): void;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createAutosaver(opts: AutosaverOptions): Autosaver {
  const { persist, monitor, debounceMs = 800, maxRetries = 5, backoffMs = 300 } = opts;

  // pendente por sessão — Map.set coalesce (o último estado vence).
  const pending = new Map<string, SessionStateDto>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const arm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void drain();
    }, debounceMs);
  };

  const drain = async (): Promise<void> => {
    if (!monitor.isOnline()) return; // pausado — retoma no reconnect
    for (const id of [...pending.keys()]) await persistOne(id);
  };

  const persistOne = async (id: string): Promise<void> => {
    const state = pending.get(id);
    if (state === undefined) return;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (!monitor.isOnline()) return; // caiu no meio → mantém pendente
      try {
        await persist(id, state);
        // só descarta se ninguém coalesceu um estado mais novo nesse meio-tempo
        if (pending.get(id) === state) pending.delete(id);
        return;
      } catch {
        if (attempt < maxRetries - 1) await delay(backoffMs * 2 ** attempt);
      }
    }
    // esgotou as tentativas: mantém pendente p/ o próximo schedule/reconnect
  };

  // ao voltar a conexão, esvazia o que ficou pendente
  const unsubscribe = monitor.subscribe((online) => {
    if (online && pending.size > 0) arm();
  });

  return {
    schedule(id, state) {
      pending.set(id, state);
      if (monitor.isOnline()) arm();
    },
    async flush(id) {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (!monitor.isOnline()) return;
      await persistOne(id);
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      unsubscribe();
    },
  };
}
